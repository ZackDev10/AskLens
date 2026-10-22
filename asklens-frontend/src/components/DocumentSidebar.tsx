import { useEffect, useState } from 'react';

interface Document {
    id: string;
    title: string;
    source_uri: string;
    created_at: string;
}

export function DocumentSidebar() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchDocuments = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/documents`);
            if (!response.ok) throw new Error('Failed to fetch documents');
            const data = await response.json();
            setDocuments(data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const deleteDocument = async (id: string) => {
        if (!confirm('Are you sure you want to delete this document?')) return;

        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/documents/${id}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                // Remove the deleted document from the UI state
                setDocuments((prev) => prev.filter((doc) => doc.id !== id));
            }
        } catch (error) {
            console.error('Failed to delete document:', error);
        }
    };

    // Fetch documents when the component mounts
    useEffect(() => {
        fetchDocuments();
    }, []);

    return (
        <div className="w-64 bg-surface border-r border-gray-800 h-full p-4 flex flex-col">
            <h2 className="text-lg font-bold text-gray-200 mb-4">Your Documents</h2>

            {isLoading ? (
                <p className="text-sm text-gray-500">Loading...</p>
            ) : documents.length === 0 ? (
                <p className="text-sm text-gray-500">No documents uploaded yet.</p>
            ) : (
                <ul className="space-y-2 overflow-y-auto flex-1 pr-2">
                    {documents.map((doc) => (
                        <li
                            key={doc.id}
                            className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-start group"
                        >
                            <div className="overflow-hidden">
                                <p className="text-sm text-gray-300 truncate font-medium" title={doc.title}>
                                    {doc.title}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    {new Date(doc.created_at).toLocaleDateString()}
                                </p>
                            </div>
                            <button
                                onClick={() => deleteDocument(doc.id)}
                                className="text-red-500/70 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete document"
                            >
                                ✕
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
