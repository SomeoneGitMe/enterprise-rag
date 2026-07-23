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
    const queryEmbedding = jinaData.data[0].embedding;

    // 2. Get Pinecone Host URL dynamically
    const pineconeKey = process.env.PINECONE_API_KEY!;
    const indexName = 'enterprise-rag';
    
    const descRes = await fetch(`https://api.pinecone.io/indexes/${indexName}`, {
      headers: { 'Api-Key': pineconeKey, 'X-Pinecone-API-Version': '2024-07' }
    });
    const descData = await descRes.json();
    const host = descData.host;

    // 3. Query Pinecone via REST API
    const queryRes = await fetch(`https://${host}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': pineconeKey,
        'X-Pinecone-API-Version': '2024-07',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vector: queryEmbedding,
        topK: 3,
        includeMetadata: true,
      })
    });

    const queryData = await queryRes.json();

    // 4. Extract the context text
    const context = queryData.matches?.map((match: any) => match.metadata?.text).join('\n\n---\n\n') || '';

    // 5. Construct the LLM prompt
    const systemPrompt = `You are an enterprise assistant. Answer the user's question based ONLY on the following context. If the context doesn't contain the answer, say "I don't have enough information in the provided documents to answer that."
    
    Context:
    ${context}`;

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-3)
    ];

    // 6. Call Groq for the final answer
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: fullMessages,
      temperature: 0.1,
    });

    const reply = completion.choices[0].message.content;

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error('RAG Chat Error:', error);
    return NextResponse.json({ error: 'Failed to generate answer' }, { status: 500 });
  }
}