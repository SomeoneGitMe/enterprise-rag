// app/api/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { fileName } = await req.json();
    
    if (!fileName) {
      return NextResponse.json({ error: 'No fileName provided' }, { status: 400 });
    }

    const pineconeKey = process.env.PINECONE_API_KEY!;
    const indexName = 'enterprise-rag';
    
    const descRes = await fetch(`https://api.pinecone.io/indexes/${indexName}`, {
      headers: { 'Api-Key': pineconeKey, 'X-Pinecone-API-Version': '2024-07' }
    });
    const descData = await descRes.json();
    const host = descData.host;

    if (!host) throw new Error('Could not find Pinecone host.');

    // Delete vectors where metadata.source matches the fileName
    const deleteRes = await fetch(`https://${host}/vectors/delete`, {
      method: 'POST',
      headers: {
        'Api-Key': pineconeKey,
        'X-Pinecone-API-Version': '2024-07',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filter: { source: { "$eq": fileName } }
      })
    });

    if (!deleteRes.ok) {
      const errorData = await deleteRes.json();
      console.error('[Delete] Pinecone Error:', errorData);
      throw new Error('Failed to delete vectors from Pinecone');
    }

    console.log(`[Delete] Successfully removed ${fileName} from Pinecone.`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[Delete Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}