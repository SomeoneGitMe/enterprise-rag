import { NextRequest, NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('pdf') as File[];
    
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    let allVectors: any[] = [];
    let totalChunks = 0;

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = new Uint8Array(bytes);
      const pdf = await getDocumentProxy(buffer);
      const { text } = await extractText(pdf, { mergePages: true });

      if (!text || text.trim().length < 10) {
        console.log(`[Ingest] No text found in ${file.name}, skipping.`);
        continue; 
      }

      // Truncate to 100,000 chars to prevent Vercel timeouts on massive PDFs
      const maxChars = 100000;
      const truncatedText = text.length > maxChars ? text.substring(0, maxChars) : text;

      const chunkSize = 1500;
      const chunks: string[] = []; 
      for (let i = 0; i < truncatedText.length; i += chunkSize) {
        const chunkText = `[Source: ${file.name}]\n${truncatedText.slice(i, i + chunkSize)}`;
        chunks.push(chunkText);
      }
      totalChunks += chunks.length;

      console.log(`[Ingest] Processing ${chunks.length} chunks for ${file.name}...`);

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
        console.error(`[Ingest] Jina API Error for ${file.name}:`, jinaData);
        continue;
      }

      const vectors = jinaData.data.map((item: any, i: number) => ({
        id: `chunk-${file.name}-${i}-${Date.now()}`,
        values: item.embedding,
        metadata: {
          text: chunks[i],
          source: file.name,
        },
      }));

      allVectors = [...allVectors, ...vectors];
    }

    if (allVectors.length === 0) {
      return NextResponse.json({ error: 'Could not extract text or generate embeddings for the uploaded PDFs.' }, { status: 500 });
    }

    console.log(`[Ingest] Upserting ${allVectors.length} total vectors to Pinecone via REST API...`);

    // FIX: Bypass Pinecone SDK entirely to avoid Next.js Webpack bundler bug
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

    const upsertRes = await fetch(`https://${host}/vectors/upsert`, {
      method: 'POST',
      headers: {
        'Api-Key': pineconeKey,
        'X-Pinecone-API-Version': '2024-07',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ vectors: allVectors })
    });

    const upsertData = await upsertRes.json();

    if (!upsertRes.ok) {
      console.error('[Ingest] Pinecone REST Error:', upsertData);
      return NextResponse.json({ error: 'Pinecone rejected the upsert.' }, { status: 500 });
    }

    console.log(`[Ingest] Successfully indexed ${totalChunks} chunks to Pinecone.`);

    return NextResponse.json({ 
      success: true, 
      message: `Indexed ${totalChunks} chunks from ${files.length} document(s).` 
    });

  } catch (error: any) {
    console.error('Ingestion Error:', error);
    return NextResponse.json({ error: 'Failed to process PDFs' }, { status: 500 });
  }
}