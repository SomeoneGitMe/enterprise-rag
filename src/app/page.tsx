'use client';

import { useState, useRef } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setFileName(file.name);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (data.success) {
        setMessages([{ role: 'assistant', content: `Successfully indexed "${file.name}". You can now ask questions about it.` }]);
      } else {
        setMessages([{ role: 'assistant', content: `Error: ${data.error}` }]);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setMessages([{ role: 'assistant', content: "Failed to upload document." }]);
    } finally {
      setIsUploading(false);
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
        body: JSON.stringify({ messages: newMessages }),
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
        
        {/* Header & Upload Zone */}
        <div className="bg-zinc-950 p-6 border-b border-zinc-800">
          <h1 className="text-2xl font-bold text-white mb-1">Enterprise RAG Knowledge Base</h1>
          <p className="text-sm text-zinc-400 mb-4">Upload a PDF and ask questions about its contents.</p>
          
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              accept="application/pdf" 
              ref={fileInputRef} 
              onChange={handleUpload} 
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={isUploading}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              {isUploading ? 'Indexing...' : 'Upload PDF'}
            </button>
            {fileName && (
              <span className="text-xs text-zinc-500 truncate">
                {isUploading ? `Processing ${fileName}...` : `Loaded: ${fileName}`}
              </span>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-zinc-900">
          {messages.length === 0 && (
            <div className="text-center mt-20">
              <p className="text-zinc-500 text-lg">Upload a document to begin.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-4 rounded-xl ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 border border-zinc-700 text-zinc-100'}`}>
                <p className="leading-relaxed text-sm">{m.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 border border-zinc-700 text-zinc-400 p-4 rounded-xl animate-pulse text-sm">
                Searching documents...
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800 flex gap-3 bg-zinc-950">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the document..."
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