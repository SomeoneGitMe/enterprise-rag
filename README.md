📚 Enterprise RAG Knowledge Base
A production-grade Retrieval-Augmented Generation (RAG) pipeline. Users can upload large PDF documents, and the system chunks the text, generates vector embeddings, and stores them in a Pinecone Vector Database. When a user asks a question, the system performs a semantic search, retrieves the most relevant paragraphs, and injects them into the LLM prompt to ensure factual, zero-hallucination answers.

🧠 How It Works
- Ingestion: The backend extracts raw text from the PDF using unpdf.
- Chunking: The text is sliced into 1000-character chunks to fit within LLM context windows.
- Embedding: Jina AI's jina-embeddings-v2-base-en model converts each chunk into a 768-dimension vector embedding.
- Storage: The vectors and metadata are upserted into a Pinecone Vector Database.
- Retrieval & Generation: When a user asks a question, the query is embedded, Pinecone performs a cosine similarity search to find the top 3 matching chunks, and Groq's Llama-3.3 LLM generates an answer based only on that retrieved context.

🛠 Tech Stack
- Frontend: Next.js 14 (App Router), React, Tailwind CSS, TypeScript
- Backend: Next.js Serverless API Routes (Node.js Runtime)
- Vector Database: Pinecone
- Embeddings: Jina AI API
- LLM: Groq (Llama-3.3-70b-versatile)

💻 Engineering Highlights
- Webpack Bypass via REST API: Encountered a notorious Next.js Webpack bundler conflict with the Pinecone SDK (Array.isArray memory reference mismatch). Solved it by completely removing the SDK and writing native fetch REST API calls to Pinecone's v1 endpoints, bypassing the bundler entirely and reducing bundle size.
- Context Window Management: Implemented messages.slice(-3) in the chat route to ensure conversational memory without exceeding token limits or triggering API rate limits during multi-turn conversations.
- Strict Prompt Engineering: Set temperature: 0.1 and a strict system prompt ("Answer based ONLY on the following context") to guarantee factual, enterprise-grade responses and prevent LLM hallucinations.
- Dynamic PDF Parsing: Utilized unpdf (over the standard pdf-parse) to ensure 100% compatibility with Next.js App Router serverless environments, preventing Object.defineProperty runtime errors.

🚀 Live Demo
URL: (enterprise-rag-mu.vercel.app)

