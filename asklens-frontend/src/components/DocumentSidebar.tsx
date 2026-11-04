import { useEffect, useState } from 'react';

interface Document {
    id: string;
    filename?: string;
    file_name?: string;
    name?: string;
    title?: string;
    source_uri?: string;
    created_at: string;
    status?: 'Processing' | 'Ready' | 'Failed';
}

interface DocumentSidebarProps {
    selectedDocs: string[];
    setSelectedDocs: React.Dispatch<React.SetStateAction<string[]>>;
    refreshTrigger: number;
}

export function DocumentSidebar({ selectedDocs, setSelectedDocs, refreshTrigger }: DocumentSidebarProps) {
    const [documents, setDocuments] = useState<Document[]>([]);

    const fetchDocuments = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/documents`);
            if (res.ok) {
                const data = await res.json();
                console.log("Documents from backend:", data);
                setDocuments(data);
                // Auto-select new documents by default
                if (selectedDocs.length === 0) {
                    setSelectedDocs(data.map((d: Document) => d.id));
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Re-fetch when the component mounts or when refreshTrigger changes
    useEffect(() => {
        fetchDocuments();
    }, [refreshTrigger]);

    const toggleAll = () => {
        if (selectedDocs.length === documents.length) setSelectedDocs([]);
        else setSelectedDocs(documents.map(d => d.id));
    };

    const toggleDoc = (id: string) => {
        setSelectedDocs(prev => prev.includes(id) ? prev.filter(docId => docId !== id) : [...prev, id]);
    };

    const deleteDocument = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Permanently delete this document and its vectors?')) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/documents/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setDocuments(prev => prev.filter(d => d.id !== id));
                setSelectedDocs(prev => prev.filter(docId => docId !== id));
            }
        } catch (error) {
            console.error(error);
        }
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'Processing': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
            case 'Failed': return 'bg-red-500/20 text-red-300 border-red-500/30';
            case 'Ready': default: return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
        }
    };

    return (
        <div className="flex flex-col flex-1 p-4 overflow-hidden mt-2">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Your Documents</h2>
                {documents.length > 0 && (
                    <button onClick={toggleAll} className="text-xs text-primary hover:text-blue-400 transition">
                        {selectedDocs.length === documents.length ? 'Deselect All' : 'Select All'}
                    </button>
                )}
            </div>

            <ul className="space-y-2 overflow-y-auto flex-1 pr-2">
                {documents.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No documents uploaded.</p>
                ) : (
                    documents.map(doc => {
                        const isSelected = selectedDocs.includes(doc.id);
                        const status = doc.status || 'Ready';
                        const displayName = doc.title || doc.source_uri || 'Unnamed Document';
                        return (
                            <li
                                key={doc.id}
                                onClick={() => toggleDoc(doc.id)}
                                className={`group flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-primary/10 border-primary/40' : 'bg-surface border-gray-800 hover:bg-gray-800/60'
                                    }`}
                            >
                                <div className="pt-0.5 shrink-0">
                                    <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-primary cursor-pointer" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p
                                        className={`text-sm font-medium truncate transition-colors ${isSelected ? 'text-gray-100' : 'text-gray-300'}`}
                                        title={displayName}
                                    >
                                        {displayName}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getStatusColor(status)}`}>{status}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => deleteDocument(doc.id, e)}
                                    title="Delete Document"
                                    className="shrink-0 p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </li>
                        );
                    })
                )}
            </ul>
        </div>
    );
}
