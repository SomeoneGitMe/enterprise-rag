import { NextRequest, NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('pdf') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // 1. Extract text from PDF
    const bytes = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });

    console.log(`[Ingest] Extracted ${text?.length || 0} characters from PDF.`);

    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: 'No readable text found in PDF.' }, { status: 400 });
    }

    // 2. Chunk the text
    const chunkSize = 1000;
    const chunks: string[] = []; 
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }

    console.log(`[Ingest] Created ${chunks.length} chunks.`);

    // 3. Create embeddings using Jina AI
    const jinaResponse = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.JINA_API_KEY}`
      },
      body: JSON.stringify({
        model: 'jina-embeddings-v2-base-en',
        input: chunks,
      })
    });

    const jinaData = await jinaResponse.json();

    if (!jinaData.data || jinaData.data.length === 0) {
      console.error('[Ingest] Jina API Error:', jinaData);
      return NextResponse.json({ error: 'Jina API failed to return embeddings.' }, { status: 500 });
    }

    console.log(`[Ingest] Received ${jinaData.data.length} embeddings from Jina.`);

    // 4. Get Pinecone Host URL dynamically
    const pineconeKey = process.env.PINECONE_API_KEY!;
    const indexName = 'enterprise-rag';
    
    const descRes = await fetch(`https://api.pinecone.io/indexes/${indexName}`, {
      headers: { 'Api-Key': pineconeKey, 'X-Pinecone-API-Version': '2024-07' }
    });
    const descData = await descRes.json();
    const host = descData.host;

    if (!host) {
      console.error('[Ingest] Could not get Pinecone host URL.', descData);
      return NextResponse.json({ error: 'Failed to connect to Pinecone.' }, { status: 500 });
    }

    // 5. Prepare vectors for raw REST upsert
    const vectors = jinaData.data.map((item: any, i: number) => ({
      id: `chunk-${i}-${Date.now()}`,
      values: item.embedding,
      metadata: {
        text: chunks[i],
        source: file.name,
      },
    }));

    console.log(`[Ingest] Prepared ${vectors.length} vectors. Upserting via REST API...`);

    // 6. Upsert directly to Pinecone REST API (Bypassing SDK entirely)
    const upsertRes = await fetch(`https://${host}/vectors/upsert`, {
      method: 'POST',
      headers: {
        'Api-Key': pineconeKey,
        'X-Pinecone-API-Version': '2024-07',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ vectors: vectors })
    });

    const upsertData = await upsertRes.json();

    if (!upsertRes.ok) {
      console.error('[Ingest] Pinecone REST Error:', upsertData);
      return NextResponse.json({ error: 'Pinecone rejected the upsert.' }, { status: 500 });
    }

    console.log(`[Ingest] Successfully indexed ${vectors.length} chunks to Pinecone.`);

    return NextResponse.json({ 
      success: true, 
      message: `Indexed ${vectors.length} chunks from ${file.name}` 
    });

  } catch (error: any) {
    console.error('Ingestion Error:', error);
    return NextResponse.json({ error: 'Failed to process PDF' }, { status: 500 });
  }
}