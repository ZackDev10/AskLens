import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

interface FileUploaderProps {
  onUploadSuccess: () => void;
  droppedFiles?: File[];
  onClearDropped?: () => void;
}

type Stage = 'uploading' | 'extracting' | 'embedding' | 'ready' | 'error';

interface UploadTask {
  id: string;
  file: File;
  progress: number;
  stage: Stage;
  errorMessage?: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onUploadSuccess,
  droppedFiles,
  onClearDropped
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [showTasks, setShowTasks] = useState(false);

  // Trigger upload when files are dropped globally
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      processFiles(droppedFiles);
      if (onClearDropped) onClearDropped();
    }
  }, [droppedFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
      e.target.value = ''; // Reset input
    }
  };

  const processFiles = (files: File[]) => {
    setShowTasks(true);
    files.forEach(file => {
      // 1. Validation Checks
      if (file.type !== 'application/pdf') {
        toast.error(`"${file.name}" is not a PDF.`);
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`"${file.name}" is over the 20MB limit.`);
        return;
      }

      const taskId = Math.random().toString(36).substring(7);
      const newTask: UploadTask = { id: taskId, file, progress: 0, stage: 'uploading' };
      setTasks(prev => [...prev, newTask]);

      uploadFile(newTask);
    });
  };

  const updateTask = (id: string, updates: Partial<UploadTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const uploadFile = (task: UploadTask) => {
    const formData = new FormData();
    formData.append('file', task.file);

    const xhr = new XMLHttpRequest();
    // Adjust this to match your FastAPI upload route
    xhr.open('POST', `${import.meta.env.VITE_API_URL}/documents`, true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        updateTask(task.id, { progress: percent });

        // Simulate backend stages while waiting for the final HTTP response
        if (percent === 100) {
          updateTask(task.id, { stage: 'extracting' });
          setTimeout(() => {
            setTasks(current => {
              const t = current.find(x => x.id === task.id);
              // Only move to embedding if it hasn't finished or errored yet
              if (t && t.stage === 'extracting') updateTask(task.id, { stage: 'embedding' });
              return current;
            });
          }, 2000);
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        updateTask(task.id, { stage: 'ready', progress: 100 });
        toast.success(`"${task.file.name}" is ready!`);
        onUploadSuccess();
      } else {
        let errMsg = 'Upload failed.';
        try {
          const res = JSON.parse(xhr.responseText);
          errMsg = res.detail || res.message || errMsg;
        } catch (e) { }

        // Map backend empty-text errors to your requested validation message
        if (errMsg.toLowerCase().includes('text') || errMsg.toLowerCase().includes('empty')) {
          errMsg = 'Scanned PDF with no extractable text.';
        }

        updateTask(task.id, { stage: 'error', errorMessage: errMsg });
        toast.error(errMsg);
      }
    };

    xhr.onerror = () => {
      updateTask(task.id, { stage: 'error', errorMessage: 'Network connection failed.' });
      toast.error('Network error occurred.');
    };

    xhr.send(formData);
  };

  // UI Helpers
  const getStageColor = (stage: Stage) => {
    switch (stage) {
      case 'uploading': return 'bg-blue-500';
      case 'extracting': return 'bg-yellow-500';
      case 'embedding': return 'bg-purple-500';
      case 'ready': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStageText = (stage: Stage) => {
    switch (stage) {
      case 'uploading': return 'Uploading...';
      case 'extracting': return 'Extracting text...';
      case 'embedding': return 'Vectorizing...';
      case 'ready': return 'Ready';
      case 'error': return 'Failed';
    }
  };

  return (
    <div className="relative">
      <input
        type="file"
        multiple
        accept="application/pdf"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        className="p-2 text-gray-400 hover:text-primary hover:bg-surface rounded-xl transition-colors"
        title="Upload documents"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      </button>

      {/* Floating Upload Queue Manager */}
      {showTasks && tasks.length > 0 && (
        <div className="absolute bottom-12 left-0 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden">
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-800 bg-gray-950">
            <span className="text-xs font-semibold text-gray-300">Uploads ({tasks.length})</span>
            <button onClick={() => setShowTasks(false)} className="text-gray-400 hover:text-gray-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto p-2 flex flex-col gap-2">
            {tasks.map(task => (
              <div key={task.id} className="bg-surface border border-gray-800 rounded-lg p-3">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="truncate max-w-[180px] font-medium text-gray-200" title={task.file.name}>
                    {task.file.name}
                  </span>
                  <span className={`font-semibold ${task.stage === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                    {getStageText(task.stage)}
                  </span>
                </div>

                {/* Progress Bar Track */}
                <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ease-out ${getStageColor(task.stage)}`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>

                {task.errorMessage && (
                  <p className="text-[10px] text-red-400 mt-1.5">{task.errorMessage}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
