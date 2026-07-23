import { Pinecone } from '@pinecone-database/pinecone';

const apiKey = process.env.PINECONE_API_KEY;

if (!apiKey) {
  throw new Error("PINECONE_API_KEY is missing from .env.local!");
}

const pc = new Pinecone({ apiKey });

export const pineconeIndex = pc.Index('enterprise-rag');