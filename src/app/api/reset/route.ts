// app/api/reset/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const pineconeKey = process.env.PINECONE_API_KEY!;
    const indexName = 'enterprise-rag';
    
    // 1. Get the host URL for the index
    const descRes = await fetch(`https://api.pinecone.io/indexes/${indexName}`, {
      headers: { 'Api-Key': pineconeKey, 'X-Pinecone-API-Version': '2024-07' }
    });
    const descData = await descRes.json();
    const host = descData.host;

    if (!host) {
      return NextResponse.json({ error: 'Failed to find Pinecone host.' }, { status: 500 });
    }

    // 2. Send the deleteAll command
    const deleteRes = await fetch(`https://${host}/vectors/delete`, {
      method: 'POST',
      headers: {
        'Api-Key': pineconeKey,
        'X-Pinecone-API-Version': '2024-07',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deleteAll: true
      })
    });

    if (!deleteRes.ok) {
      const errorData = await deleteRes.json();
      console.error('[Reset] Pinecone Delete Error:', errorData);
      return NextResponse.json({ error: 'Failed to flush Pinecone index.' }, { status: 500 });
    }

    console.log('[Reset] Successfully flushed all vectors from Pinecone.');
    return NextResponse.json({ success: true, message: 'Pinecone index has been completely wiped clean.' });

  } catch (error: any) {
    console.error('[Reset Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}