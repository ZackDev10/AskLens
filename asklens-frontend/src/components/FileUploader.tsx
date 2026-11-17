import { Loader2, Paperclip } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const FileUploader = ({ onUploadSuccess, droppedFiles, onClearDropped, t }: any) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');

  const handleFiles = async (files: FileList | File[]) => {
    const valid = Array.from(files).filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (valid.length === 0) {
      toast.error('Only PDF files are supported');
      return;
    }

    setUploading(true);
    setProgressText(t.uploading);

    for (const file of valid) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name} exceeds the 50MB limit`);
        continue;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        setProgressText(t.extracting);
        const res = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          body: formData,
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.detail || `Upload failed (${res.status})`);
        }

        setProgressText(t.vectorizing);
        if (data.status === 'skipped') {
          toast(`${file.name}: ${data.message}`);
        } else {
          toast.success(`${file.name} ready!`);
        }
      } catch (e: any) {
        toast.error(e.message || `Failed: ${file.name}`);
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
      <input
        type="file"
        ref={inputRef}
        onChange={e => e.target.files && handleFiles(e.target.files)}
        className="hidden"
        multiple
        accept=".pdf"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] rounded-xl transition-all disabled:opacity-50"
      >
        <Paperclip className="w-5 h-5" />
      </button>

      {uploading && (
        <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 bg-[var(--bg-surface)] border border-blue-500 shadow-lg rounded-xl px-4 py-3 flex items-center gap-3 z-50">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          <span className="text-sm font-medium text-[var(--text-primary)]">{progressText}</span>
        </div>
      )}
    </>
  );
};
