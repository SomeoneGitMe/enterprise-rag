'use client';

import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [activePdf, setActivePdf] = useState<string | null>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    
    const names = Array.from(files).map(f => f.name);
    
    setFileNames(prev => {
      const combined = [...new Set([...prev, ...names])];
      if (combined.length > 5) {
        return combined.slice(combined.length - 5);
      }
      return combined;
    });

    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('pdf', file);
    });

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (data.success) {
        setMessages([{ role: 'assistant', content: `Successfully indexed ${names.length} document(s). You can now ask questions across all of them, or select a specific document above.` }]);
      } else {
        setMessages([{ role: 'assistant', content: `Error: ${data.error}` }]);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setMessages([{ role: 'assistant', content: "Failed to upload documents." }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (fileName: string) => {
    // Optimistically remove from UI
    const remainingFiles = fileNames.filter(f => f !== fileName);
    setFileNames(remainingFiles);
    
    // If the deleted file was active, reset to All Documents
    if (activePdf === fileName) {
      setActivePdf(null);
    }

    try {
      await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName })
      });
      setMessages([{ role: 'assistant', content: `Removed ${fileName} from the database.` }]);
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handleClearAll = async () => {
    setFileNames([]);
    setActivePdf(null);
    setMessages([]);

    try {
      await fetch('/api/reset');
      setMessages([{ role: 'assistant', content: "All documents cleared. Upload a new PDF to begin." }]);
    } catch (error) {
      console.error('Clear All error:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages,
          fileContext: activePdf 
        }),
      });
      
      const data = await res.json();
      
      if (data.reply) {
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: "Sorry, I couldn't process that." }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages([...newMessages, { role: 'assistant', content: "Connection error." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center p-4">
      <div className="w-full max-w-3xl flex flex-col h-[90vh] bg-zinc-900 rounded-2xl shadow-xl border border-zinc-800 overflow-hidden">
        
        <div className="bg-zinc-950 p-6 border-b border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">Enterprise RAG Knowledge Base</h1>
              <p className="text-sm text-zinc-400">Upload up to 5 PDFs and ask questions across all of them, or target specific ones.</p>
            </div>
            {fileNames.length > 0 && (
              <button 
                onClick={handleClearAll} 
                className="bg-zinc-800 hover:bg-red-900/50 text-zinc-400 hover:text-red-400 px-3 py-1.5 rounded-lg text-xs font-semibold transition border border-zinc-700"
              >
                Clear All
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              accept="application/pdf" 
              multiple
              ref={fileInputRef} 
              onChange={handleUpload} 
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={isUploading}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              {isUploading ? 'Indexing...' : 'Upload PDFs'}
            </button>
          </div>

          {fileNames.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              <button 
                onClick={() => setActivePdf(null)} 
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${activePdf === null ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
              >
                All Documents
              </button>
              {fileNames.map((name, idx) => (
                <div key={idx} className={`group flex items-center rounded-full text-xs font-semibold transition ${activePdf === name ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  <button 
                    onClick={() => setActivePdf(name)} 
                    className="px-3 py-1 truncate max-w-[120px]"
                  >
                    {name}
                  </button>
                  <button 
                    onClick={() => handleDeleteFile(name)} 
                    className="px-2 py-1 border-l border-white/10 hover:bg-red-600 rounded-r-full opacity-0 group-hover:opacity-100 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-zinc-900">
          {messages.length === 0 && (
            <div className="text-center mt-20">
              <p className="text-zinc-500 text-lg">Upload documents to begin.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-4 rounded-xl ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 border border-zinc-700 text-zinc-100'}`}>
                {m.role === 'user' ? (
                  <p className="leading-relaxed text-sm">{m.content}</p>
                ) : (
                  <ReactMarkdown
                    components={{
                      h1: ({ ...props }) => <h1 className="text-xl font-bold text-white mt-4 mb-2" {...props} />,
                      h2: ({ ...props }) => <h2 className="text-lg font-bold text-blue-400 mt-4 mb-2" {...props} />,
                      h3: ({ ...props }) => <h3 className="text-base font-bold text-zinc-200 mt-3 mb-1" {...props} />,
                      ul: ({ ...props }) => <ul className="list-disc list-inside text-zinc-300 my-2 space-y-1" {...props} />,
                      ol: ({ ...props }) => <ol className="list-decimal list-inside text-zinc-300 my-2 space-y-1" {...props} />,
                      p: ({ ...props }) => <p className="leading-relaxed text-sm text-zinc-300 mb-2" {...props} />,
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 border border-zinc-700 text-zinc-400 p-4 rounded-xl animate-pulse text-sm">
                {activePdf ? `Searching ${activePdf}...` : 'Searching all documents...'}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800 flex gap-3 bg-zinc-950">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={activePdf ? `Ask about ${activePdf}...` : "Ask about the documents..."}
            className="flex-1 bg-zinc-900 text-white px-4 py-3 rounded-xl outline-none border border-zinc-800 focus:border-blue-500 text-sm"
          />
          <button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50 text-sm">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}