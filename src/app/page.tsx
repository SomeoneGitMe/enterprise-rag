  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    
    const names = Array.from(files).map(f => f.name);
    
    setFileNames(prev => {
      // FIX: Used Array.from() to bypass TS downlevelIteration error
      const combined = Array.from(new Set([...prev, ...names]));
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