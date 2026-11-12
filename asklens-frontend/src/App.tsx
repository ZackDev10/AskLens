import React, { useEffect, useRef, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { ChatSidebar } from './components/ChatSidebar';
import { DocumentSidebar } from './components/DocumentSidebar';
import { FileUploader } from './components/FileUploader';
import { useChatStream } from './hooks/useChatStream';
import { Copy, Check, ThumbsUp, ThumbsDown, RefreshCw, Bot, Send, Square, Menu, Search, FileText, AlertCircle, Sun, Moon } from 'lucide-react';
import toast from 'react-hot-toast';

const translations: Record<string, any> = {
    en: {
        subtitle: 'RAG Document Assistant',
        dropFiles: 'Drop PDF files here',
        dropDesc: 'They will be uploaded and vectorized immediately',
        readyForAnalysis: 'documents ready for analysis',
        askAnything: 'Ask anything about your documents',
        inputPlaceholder: 'Ask a question about your documents...',
        newChat: 'New Chat',
        noChats: 'No recent chats yet.',
        yourDocs: 'Your Documents',
        selectAll: 'Select All',
        deselectAll: 'Deselect All',
        selectDocsWarning: 'Select at least one document to ask a question.',
        ready: 'Ready',
        processing: 'Processing',
        failed: 'Failed',
        uploading: 'Uploading...',
        extracting: 'Extracting...',
        vectorizing: 'Vectorizing...',
        stop: 'Stop generating',
        sources: 'Sources',
        copied: 'Copied!',
        copyCode: 'Copy code',
        retry: 'Retry',
        untitledDoc: 'Untitled document',
        noDocs: 'No documents yet. Upload a PDF to get started.',
        deleted: 'Deleted',
        deleteFailed: 'Failed to delete',
        prompts: [
            { title: 'Summarize the docs', q: 'Please provide a comprehensive summary of the main topics discussed in these documents.' },
            { title: 'Extract key points', q: 'What are the most important highlights and takeaways from the text?' },
            { title: 'Define core concepts', q: 'Can you explain the primary terminology and concepts used in these documents?' }
        ]
    },
    fr: {
        subtitle: 'Assistant Documentaire RAG',
        dropFiles: 'Déposez les fichiers PDF ici',
        dropDesc: 'Ils seront importés et vectorisés immédiatement',
        readyForAnalysis: 'documents prêts pour l\'analyse',
        askAnything: 'Posez des questions sur vos documents',
        inputPlaceholder: 'Posez une question sur vos documents...',
        newChat: 'Nouvelle conversation',
        noChats: 'Pas de conversations récentes.',
        yourDocs: 'Vos documents',
        selectAll: 'Tout sélectionner',
        deselectAll: 'Tout désélectionner',
        selectDocsWarning: 'Sélectionnez au moins un document pour poser une question.',
        ready: 'Prêt',
        processing: 'En traitement',
        failed: 'Échec',
        uploading: 'Téléchargement...',
        extracting: 'Extraction...',
        vectorizing: 'Vectorisation...',
        stop: 'Arrêter la génération',
        sources: 'Sources',
        copied: 'Copié !',
        copyCode: 'Copier le code',
        retry: 'Réessayer',
        untitledDoc: 'Document sans titre',
        noDocs: 'Aucun document. Téléchargez un PDF pour commencer.',
        deleted: 'Supprimé',
        deleteFailed: 'Échec de la suppression',
        prompts: [
            { title: 'Résumer les documents', q: 'Veuillez fournir un résumé complet des principaux sujets abordés dans ces documents.' },
            { title: 'Extraire les points clés', q: 'Quels sont les points saillants et les conclusions importantes du texte ?' },
            { title: 'Définir les concepts', q: 'Pouvez-vous expliquer la terminologie et les concepts principaux utilisés ?' }
        ]
    }
};

const CodeBlock = ({ language, value, t }: any) => {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="my-4 rounded-xl overflow-hidden border border-[var(--border-dim)] bg-[#0d1117] text-gray-200 shadow-md">
            <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[var(--border-dim)] text-xs text-gray-400 font-mono">
                <span className="uppercase tracking-wider font-semibold text-blue-400">{language || 'code'}</span>
                <button onClick={copy} className="flex items-center gap-1.5 hover:text-white transition-colors py-0.5 px-2 rounded hover:bg-white/10">
                    {copied ? (
                        <><Check className="w-3.5 h-3.5 text-green-400" /> <span className="text-green-400">{t.copied}</span></>
                    ) : (
                        <><Copy className="w-3.5 h-3.5" /> <span>{t.copyCode}</span></>
                    )}
                </button>
            </div>
            <SyntaxHighlighter style={vscDarkPlus as any} language={language} PreTag="div" customStyle={{ margin: 0, padding: '1rem', fontSize: '0.75rem', background: 'transparent' }}>
                {value}
            </SyntaxHighlighter>
        </div>
    );
};

const MarkdownRenderers = (t: any) => ({
    code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        const codeString = String(children).replace(/\n$/, '');
        return !inline && match ? (
            <CodeBlock language={match[1]} value={codeString} t={t} />
        ) : (
            <code {...props} className="bg-[var(--bg-surface)] border border-[var(--border-dim)] rounded px-1.5 py-0.5 text-blue-500 text-xs font-mono">{children}</code>
        );
    },
    p: ({ node, ...props }: any) => <p className="mb-3 last:mb-0 leading-relaxed" {...props} />,
    ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
    h1: ({ node, ...props }: any) => <h1 className="text-xl font-bold mb-2 mt-4" {...props} />,
    h2: ({ node, ...props }: any) => <h2 className="text-lg font-bold mb-2 mt-4" {...props} />,
    h3: ({ node, ...props }: any) => <h3 className="text-base font-bold mb-2 mt-3" {...props} />,
});

const SourceChips = ({ sources, t }: { sources: any[], t: any }) => {
    const grouped = sources.reduce((acc: any, src: any) => {
        if (!acc[src.title]) acc[src.title] = [];
        acc[src.title].push(src);
        return acc;
    }, {});

    return (
        <div className="mt-4 pt-4 border-t border-[var(--border-dim)]">
            <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">{t.sources}</p>
            <div className="flex flex-wrap gap-2">
                {Object.entries(grouped).map(([title, srcs]: any) => {
                    const pages = Array.from(new Set(srcs.map((s: any) => s.page))).sort((a: any, b: any) => a - b).join(', ');
                    return (
                        <div key={title} title={title} className="flex items-center gap-1.5 text-[11px] font-medium bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-dim)] cursor-pointer hover:border-gray-400 transition-colors shadow-sm">
                            <FileText className="w-3.5 h-3.5 text-blue-500" />
                            <span className="truncate max-w-[140px]">{title}</span>
                            <span className="text-[var(--text-secondary)] opacity-75">· p.{pages}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

function App() {
    const [lang, setLang] = useState<'en' | 'fr'>(() => (localStorage.getItem('asklens_lang') as any) || 'en');
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('asklens_theme') as any) || 'dark');
    const t = translations[lang] || translations.en;

    useEffect(() => { document.documentElement.className = theme; localStorage.setItem('asklens_theme', theme); }, [theme]);
    useEffect(() => { localStorage.setItem('asklens_lang', lang); }, [lang]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
    const [docCount, setDocCount] = useState(0);
    const [refreshDocs, setRefreshDocs] = useState(0);

    const scrollRef = useRef<HTMLElement>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [dragActive, setDragActive] = useState(false);
    const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

    const { messages, isStreaming, statusText, sendMessage, stopStreaming, activeChatId, loadChat, startNewChat } = useChatStream();

    useEffect(() => {
        fetch(import.meta.env.VITE_API_URL + '/documents')
            .then(r => r.json())
            .then(d => setDocCount(d?.length || 0))
            .catch(() => { });
    }, [refreshDocs]);

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
    };

    useEffect(() => {
        if (autoScroll) endRef.current?.scrollIntoView({ behavior: 'auto' });
    }, [messages, autoScroll]);

    const submit = async (override?: string) => {
        const q = override || inputValue;
        if (!q.trim() || isStreaming) return;
        if (selectedDocs.length === 0) {
            toast.error(t.selectDocsWarning);
            return;
        }
        setInputValue('');
        setAutoScroll(true);
        await sendMessage(q, selectedDocs, lang);
    };

    const onDrag = (e: any) => { e.preventDefault(); e.stopPropagation(); setDragActive(e.type === 'dragenter' || e.type === 'dragover'); };
    const onDrop = (e: any) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files?.length) setDroppedFiles(Array.from(e.dataTransfer.files)); };

    return (
        <div className="flex h-screen w-full bg-[var(--bg-background)] relative overflow-hidden transition-colors duration-300" onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag} onDrop={onDrop}>
            <Toaster
                position="bottom-right"
                toastOptions={{
                    className: 'border border-[var(--border-dim)] text-sm shadow-xl rounded-xl',
                    style: { background: 'var(--bg-surface)', color: 'var(--text-primary)' }
                }}
            />

            {dragActive && (
                <div className="absolute inset-0 z-[100] bg-[var(--bg-background)]/90 backdrop-blur-sm flex items-center justify-center border-4 border-blue-500 border-dashed m-4 rounded-3xl">
                    <div className="text-center space-y-4">
                        <Search className="w-16 h-16 text-blue-500 mx-auto animate-bounce" />
                        <h2 className="text-3xl font-bold text-[var(--text-primary)]">{t.dropFiles}</h2>
                        <p className="text-[var(--text-secondary)]">{t.dropDesc}</p>
                    </div>
                </div>
            )}

            {isMobileOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsMobileOpen(false)} />}

            <div className={`fixed md:relative z-50 h-full bg-[var(--bg-surface)] border-r border-[var(--border-dim)] flex flex-col shrink-0 transition-all duration-300 ${isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'} ${isSidebarOpen ? 'md:w-72' : 'md:w-0 md:border-transparent'}`}>
                <div className={`flex flex-col h-full w-72 overflow-hidden transition-opacity ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="flex-1 overflow-y-auto">
                        <ChatSidebar activeChatId={activeChatId} loadChat={id => { loadChat(id); setIsMobileOpen(false); }} startNewChat={() => { startNewChat(); setIsMobileOpen(false); }} t={t} />
                    </div>
                    <hr className="border-[var(--border-dim)]" />
                    <div className="h-1/3 min-h-[250px] overflow-y-auto">
                        <DocumentSidebar selectedDocs={selectedDocs} setSelectedDocs={setSelectedDocs} refreshTrigger={refreshDocs} t={t} />
                    </div>
                </div>
            </div>

            <div className="flex flex-col flex-1 w-full min-w-0 max-w-4xl mx-auto px-3 md:px-6 relative">
                <header className="py-3 md:py-4 border-b border-[var(--border-dim)] mb-2 flex justify-between items-center px-1">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="hidden md:block p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] rounded-xl"><Menu className="w-5 h-5" /></button>
                        <button onClick={() => setIsMobileOpen(true)} className="md:hidden p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] rounded-xl"><Menu className="w-5 h-5" /></button>
                        <div className="w-10 h-10 bg-blue-500 text-white flex items-center justify-center rounded-xl shadow-md"><Search className="w-5 h-5" /></div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-extrabold text-[var(--text-primary)] leading-none">AskLens</h1>
                            <p className="text-[11px] font-medium text-[var(--text-secondary)]">{t.subtitle}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setLang(lang === 'en' ? 'fr' : 'en')} className="p-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] rounded-lg uppercase">{lang}</button>
                        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] rounded-lg">
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                    </div>
                </header>

                <main ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto mb-4 space-y-6 pr-2">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto px-4 gap-8">
                            <div className="text-center space-y-4">
                                <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mx-auto ring-1 ring-blue-500/20"><Search className="w-8 h-8" /></div>
                                <div><h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">{t.askAnything}</h2><p className="text-[var(--text-secondary)] font-medium">{docCount} {t.readyForAnalysis}</p></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                                {t.prompts.map((p: any, i: number) => (
                                    <button key={i} onClick={() => submit(p.q)} className="text-left p-4 rounded-2xl border border-[var(--border-dim)] bg-[var(--bg-surface)] hover:border-blue-500/50 transition-all group shadow-sm">
                                        <span className="block text-sm font-semibold text-[var(--text-primary)] mb-1 group-hover:text-blue-500">{p.title}</span>
                                        <span className="block text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">{p.q}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, idx) => (
                            <div key={idx} className={`flex gap-3 md:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role !== 'user' && <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20 mt-1"><Bot className="w-4 h-4 text-blue-500" /></div>}

                                <div className={`p-4 text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-[18px] rounded-br-[4px] max-w-[85%] md:max-w-[75%]' : msg.role === 'error' ? 'bg-red-500/10 text-red-500 rounded-[18px] rounded-bl-[4px] border border-red-500/20 w-full' : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-dim)] rounded-[18px] rounded-bl-[4px] w-full'}`}>

                                    {msg.role === 'assistant' ? (
                                        <div className="w-full overflow-hidden">
                                            <div className="prose prose-sm max-w-none prose-invert text-[var(--text-primary)]">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownRenderers(t) as any}>{msg.content || ' '}</ReactMarkdown>
                                                {isStreaming && idx === messages.length - 1 && <span className="inline-block w-2 h-4 ml-1 bg-blue-500 animate-pulse align-middle rounded-sm" />}
                                            </div>

                                            {msg.sources && msg.sources.length > 0 && <SourceChips sources={msg.sources} t={t} />}

                                            {!isStreaming && (
                                                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--border-dim)] text-[var(--text-secondary)]">
                                                    <button onClick={() => { navigator.clipboard.writeText(msg.content); toast.success(t.copied); }} className="p-1 hover:text-[var(--text-primary)] transition-colors"><Copy className="w-4 h-4" /></button>
                                                    <button onClick={() => submit(messages.slice().reverse().find(m => m.role === 'user')?.content || '')} className="p-1 hover:text-[var(--text-primary)] transition-colors"><RefreshCw className="w-4 h-4" /></button>
                                                    <button className="p-1 hover:text-blue-500 transition-colors"><ThumbsUp className="w-4 h-4" /></button>
                                                    <button className="p-1 hover:text-red-500 transition-colors"><ThumbsDown className="w-4 h-4" /></button>
                                                </div>
                                            )}
                                        </div>
                                    ) : msg.role === 'error' ? (
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {msg.content}</span>
                                            <button onClick={() => submit(messages.slice().reverse().find(m => m.role === 'user')?.content || '')} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold shadow-sm">{t.retry}</button>
                                        </div>
                                    ) : (
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={endRef} className="h-4" />
                </main>

                <div className="pt-2 pb-safe px-1 sticky bottom-0 z-20 bg-[var(--bg-background)]">
                    <div className="max-w-3xl mx-auto w-full relative">
                        {isStreaming && statusText && (
                            <div className="absolute -top-10 left-0 text-xs font-medium text-[var(--text-secondary)] flex items-center gap-2 bg-[var(--bg-surface)] px-3 py-1.5 rounded-full border border-[var(--border-dim)] shadow-sm">
                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></span> {statusText}
                            </div>
                        )}

                        <div className="relative flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-dim)] rounded-2xl p-1.5 shadow-lg focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                            <FileUploader onUploadSuccess={() => setRefreshDocs(prev => prev + 1)} droppedFiles={droppedFiles} onClearDropped={() => setDroppedFiles([])} t={t} />

                            <textarea value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} disabled={isStreaming} placeholder={t.inputPlaceholder} className="flex-1 bg-transparent border-none focus:outline-none resize-none py-3 px-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] max-h-[140px] min-h-[44px] overflow-y-auto" rows={1} />

                            {isStreaming ? (
                                <button onClick={stopStreaming} className="p-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 shadow-md transition-all active:scale-95 mx-1"><Square className="w-4 h-4 fill-current" /></button>
                            ) : (
                                <button onClick={() => submit()} disabled={!inputValue.trim() || selectedDocs.length === 0} className={`p-2.5 rounded-xl transition-all duration-200 mx-1 ${!inputValue.trim() || selectedDocs.length === 0 ? 'bg-[var(--bg-background)] text-[var(--text-muted)] border border-[var(--border-dim)] cursor-not-allowed opacity-50' : 'bg-blue-500 text-white hover:bg-blue-600 shadow-md active:scale-95'}`}><Send className="w-4 h-4 ml-0.5" /></button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
