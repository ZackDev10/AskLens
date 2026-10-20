import { useState } from 'react';

export function FileUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState('');

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setStatusText('Uploading to Codespace...');

    // FormData automatically sets the correct multipart headers
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Your Vite proxy will route this /api/upload request to Uvicorn port 8000
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      setStatusText('Upload successful! You can now ask questions about this document.');

    } catch (error) {
      console.error(error);
      setStatusText('Error uploading file.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-4 mb-4">
      <label className="cursor-pointer px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
        {isUploading ? 'Uploading...' : 'Upload PDF'}
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleUpload}
          disabled={isUploading}
        />
      </label>
      {statusText && (
        <span className="text-sm text-gray-400">{statusText}</span>
      )}
    </div>
  );
}
