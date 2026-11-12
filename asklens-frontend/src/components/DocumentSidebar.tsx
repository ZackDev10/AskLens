import { CheckSquare, Square, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

interface Doc {
  id: string;
  filename?: string;
  title?: string;
  name?: string;
  status?: string;
  created_at?: string;
}

interface Props {
  selectedDocs: string[];
  setSelectedDocs: (ids: string[]) => void;
  refreshTrigger: number;
  t: any;
}

export const DocumentSidebar: React.FC<Props> = ({ selectedDocs, setSelectedDocs, refreshTrigger, t }) => {
  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    fetch(import.meta.env.VITE_API_URL + '/documents')
      .then(r => r.json())
      .then(d => setDocs(d))
      .catch(() => { });
  }, [refreshTrigger]);

  const toggle = (id: string) => {
    setSelectedDocs(selectedDocs.includes(id) ? selectedDocs.filter(x => x !== id) : [...selectedDocs, id]);
  };
  const toggleAll = () => setSelectedDocs(selectedDocs.length === docs.length ? [] : docs.map(d => d.id));

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete document?')) return;
    try {
      await fetch(import.meta.env.VITE_API_URL + '/documents/' + id, { method: 'DELETE' });
      setDocs(docs.filter(d => d.id !== id));
      setSelectedDocs(selectedDocs.filter(x => x !== id));
      toast.success(t.deleted || 'Deleted');
    } catch {
      toast.error(t.deleteFailed || 'Failed to delete');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] px-4 pb-4">
      <div className="flex items-center justify-between py-4 sticky top-0 bg-[var(--bg-surface)] z-10">
        <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{t.yourDocs}</h2>
        <button onClick={toggleAll} className="text-xs text-blue-500 hover:text-blue-600 font-medium">
          {selectedDocs.length === docs.length ? t.deselectAll : t.selectAll}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2">
        {docs.length === 0 ? (
          <div className="text-center py-6 px-2 border border-dashed border-[var(--border-dim)] rounded-xl mt-2">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{t.noDocs}</p>
          </div>
        ) : (
          docs.map(d => {
            const sel = selectedDocs.includes(d.id);
            const docName = d.title || d.filename || d.name || t.untitledDoc;
            const docStatus = d.status || 'ready';
            const uploadDate = d.created_at ? new Date(d.created_at).toLocaleDateString() : '';

            return (
              <div key={d.id} onClick={() => toggle(d.id)} title={docName} className={`group relative flex flex-col p-3 rounded-xl border transition-all cursor-pointer ${sel ? 'border-blue-500/40 bg-blue-500/5' : 'border-[var(--border-dim)] hover:border-gray-400 opacity-80 hover:opacity-100'}`}>
                <div className="flex items-start gap-3">
                  <button className={`mt-0.5 transition-colors ${sel ? 'text-blue-500' : 'text-[var(--text-muted)]'}`}>
                    {sel ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate font-medium ${sel ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{docName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${docStatus === 'ready' ? 'bg-green-500/10 text-green-500' : docStatus === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                        {t[docStatus] || docStatus}
                      </span>
                      {uploadDate && (
                        <span className="text-[10px] text-[var(--text-muted)] font-medium">{uploadDate}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={(e) => del(d.id, e)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
