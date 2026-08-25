// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDynamicModel } from '@/lib/ai-router';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { messages, fileContext } = await req.json();
    const userQuery = messages[messages.length - 1].content;

    // 1. Generate query embedding using Jina
    const jinaResponse = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.JINA_API_KEY}`
      },
      body: JSON.stringify({
        model: 'jina-embeddings-v2-base-en',
        input: [userQuery],
      })
    });

    const jinaData = await jinaResponse.json();
    const queryVector = jinaData.data[0].embedding;

    // 2. Query Pinecone
    const pineconeKey = process.env.PINECONE_API_KEY!;
    const indexName = 'enterprise-rag';
    
    const descRes = await fetch(`https://api.pinecone.io/indexes/${indexName}`, {
      headers: { 'Api-Key': pineconeKey, 'X-Pinecone-API-Version': '2024-07' }
    });
    const descData = await descRes.json();
    const host = descData.host;

    const pineconeResponse = await fetch(`https://${host}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': pineconeKey,
        'X-Pinecone-API-Version': '2024-07',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vector: queryVector,
        topK: 5,
        includeMetadata: true,
        filter: fileContext ? { source: { $eq: fileContext } } : undefined,
      })
    });

    const pineconeData = await pineconeResponse.json();
    
    // 3. Assemble strict RAG context
    const contextText = pineconeData.matches
      .map((match: any) => match.metadata.text)
      .join('\n\n---\n\n');

    // 4. PROOF: Log the exact text being retrieved from Pinecone
    console.log('\n--- [RAG RETRIEVAL] ---');
    console.log('User Query:', userQuery);
    console.log('Retrieved Context:\n', contextText);
    console.log('-----------------------\n');

    if (!contextText || contextText.trim().length < 10) {
      return NextResponse.json({ 
        reply: "I couldn't find any information about that in the selected PDF." 
      });
    }

    // 5. Dynamic Model Selection
    const modelId = await getDynamicModel();

    // 6. Strict System Prompt
    const systemPrompt = `You are an elite RAG AI assistant. You must answer the user's question STRICTLY using the provided context. 
    If the context does not contain the information necessary to answer the question, you must explicitly state: "The provided context does not contain information about this." 
    DO NOT use any outside knowledge, pre-trained data, or assumptions. 
    DO NOT reference the filenames or the structure of the text. 
    Synthesize the answer professionally and directly from the text below.

    CONTEXT:
    ${contextText}`;

    // 7. Call Groq via native fetch
    const chatResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(0, -1), 
          { role: 'user', content: userQuery }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!chatResponse.ok) {
      const errorData = await chatResponse.json();
      console.error('[Chat] Groq API Error:', errorData);
      throw new Error('Groq chat completion failed');
    }
    
    const chatData = await chatResponse.json();
    const reply = chatData.choices[0].message.content;

    return NextResponse.json({ reply, modelUsed: modelId });

  } catch (error: any) {
    console.error('[Chat Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}