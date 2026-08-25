import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: "https://api.groq.com/openai/v1"
});

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1].content;

    // 1. Create embedding for the user's question using Jina AI
    const jinaResponse = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.JINA_API_KEY}`
      },
      body: JSON.stringify({
        model: 'jina-embeddings-v2-base-en',
        input: [lastMessage],
      })
    });

    const jinaData = await jinaResponse.json();
    
    if (!jinaData.data || jinaData.data.length === 0) {
      console.error('[Chat] Jina Error:', jinaData);
      return NextResponse.json({ error: 'Failed to create query embedding.' }, { status: 500 });
    }
    
    const queryEmbedding = jinaData.data[0].embedding;

    // 2. Query Pinecone via REST API
    const pineconeKey = process.env.PINECONE_API_KEY!;
    const indexName = 'enterprise-rag';
    
    const descRes = await fetch(`https://api.pinecone.io/indexes/${indexName}`, {
      headers: { 'Api-Key': pineconeKey, 'X-Pinecone-API-Version': '2024-07' }
    });
    
    const descData = await descRes.json();
    
    // FIX: Check if Pinecone returned an error (like index paused)
    if (!descRes.ok || !descData.host) {
      console.error('[Chat] PINECONE ERROR:', descData);
      return NextResponse.json({ error: 'Pinecone index might be paused or missing. Check your Pinecone dashboard.' }, { status: 500 });
    }
    
    const host = descData.host;

    const queryRes = await fetch(`https://${host}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': pineconeKey,
        'X-Pinecone-API-Version': '2024-07',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vector: queryEmbedding,
        topK: 5,
        includeMetadata: true,
      })
    });

    const queryData = await queryRes.json();

    // 3. Extract the context text
    const context = queryData.matches?.map((match: any) => match.metadata?.text).join('\n\n---\n\n') || '';

    // 4. Construct the LLM prompt
    const systemPrompt = `You are an enterprise assistant. Answer the user's question based ONLY on the following context. 
    
    FORMATTING RULES:
    - You MUST format your response in beautiful, clean Markdown.
    - Use bullet points (-) for lists.
    - Use **bold text** for key terms or important concepts.
    - Use ### headings to separate different topics if applicable.
    - Keep paragraphs short and readable.
    
    If the context doesn't contain the answer, say "I don't have enough information in the provided documents to answer that."
    
    Context:
    ${context}`;

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-3)
    ];

    // 5. Call Groq for the final answer
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: fullMessages,
      temperature: 0.2,
    });

    const reply = completion.choices[0].message.content;

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error('[Chat] RAG Catch Block Error:', error);
    return NextResponse.json({ error: 'Failed to generate answer' }, { status: 500 });
  }
}