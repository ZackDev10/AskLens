import React, { useRef, useState, useEffect } from 'react';
import { Paperclip, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export const FileUploader = ({ onUploadSuccess, droppedFiles, onClearDropped, t }: any) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');

  const handleFiles = async (files: FileList | File[]) => {
    const valid = Array.from(files).filter(f => f.type === 'application/pdf');
    if (valid.length === 0) { toast.error('Only PDFs are supported'); return; }

    setUploading(true);
    setProgressText(t.uploading);

    for (const file of valid) {
      if (file.size > 50 * 1024 * 1024) { toast.error(`${file.name} is too large (>50MB)`); continue; }
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(import.meta.env.VITE_API_URL + '/documents', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        setProgressText(t.extracting);
        setTimeout(() => setProgressText(t.vectorizing), 1500);
      } catch (e) {
        toast.error(`Failed: ${file.name}`);
      }
    }

    setUploading(false);
    setProgressText('');
    onUploadSuccess();
    if (inputRef.current) inputRef.current.value = '';
  };

  useEffect(() => {
    if (droppedFiles?.length > 0) {
      handleFiles(droppedFiles);
      onClearDropped();
    }
  }, [droppedFiles]);

  return (
    <>
      <input type="file" ref={inputRef} onChange={e => e.target.files && handleFiles(e.target.files)} className="hidden" multiple accept=".pdf" />
      <button onClick={() => inputRef.current?.click()} disabled={uploading} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] rounded-xl transition-all disabled:opacity-50">
        <Paperclip className="w-5 h-5" />
      </button>

      {uploading && (
        <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 bg-[var(--bg-surface)] border border-blue-500 shadow-lg rounded-xl px-4 py-3 flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          <span className="text-sm font-medium text-[var(--text-primary)]">{progressText}</span>
        </div>
      )}
    </>
  );
};
