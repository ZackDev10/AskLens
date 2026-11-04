import { useEffect, useRef, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { ChatSidebar } from './components/ChatSidebar';
import { DocumentSidebar } from './components/DocumentSidebar';
import { FileUploader } from './components/FileUploader';
import { useChatStream } from './hooks/useChatStream';

// --- i18n TRANSLATION DICTIONARY ---
type Language = 'en' | 'fr';
type Theme = 'light' | 'dark';

const translations = {
  en: {
    subtitle: 'RAG Document Assistant',
    dropFiles: 'Drop PDF files here',
    dropDesc: 'They will be uploaded and vectorized immediately',
    readyForAnalysis: 'ready for analysis',
    askAnything: 'Ask anything about your documents',
    inputPlaceholder: 'Ask a question about your documents...',
    document: 'document',
    documents: 'documents',
    prompts: [
      { title: 'Summarize the docs', desc: 'Provide a brief summary of the main topics discussed.' },
      { title: 'Extract key points', desc: 'List the most important highlights and takeaways.' },
      { title: 'Define core concepts', desc: 'Explain the primary terminology used in the text.' }
    ]
  },
  fr: {
    subtitle: 'Assistant Documentaire RAG',
    dropFiles: 'Déposez les fichiers PDF ici',
    dropDesc: 'Ils seront importés et vectorisés immédiatement',
    readyForAnalysis: 'prêts pour l\'analyse',
    askAnything: 'Posez des questions sur vos documents',
    inputPlaceholder: 'Posez une question sur vos documents...',
    document: 'document',
    documents: 'documents',
    prompts: [
      { title: 'Résumer les documents', desc: 'Fournir un bref résumé des principaux sujets abordés.' },
      { title: 'Extraire les points clés', desc: 'Lister les points saillants et les conclusions importantes.' },
      { title: 'Définir les concepts', desc: 'Expliquer la terminologie principale utilisée dans le texte.' }
    ]
  }
};

// --- SOURCE CHIP COMPONENT ---
const SourceChip = ({ source }: { source: any }) => {
  const [expanded, setExpanded] = useState(false);
  const scorePct = source.score ? `${Math.round(source.score * 100)}%` : 'N/A';

  return (
    <div className={`flex flex-col gap-1.5 transition-all duration-300 ${expanded ? 'w-full' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-[11px] font-medium bg-[var(--bg-surface)] hover:bg-[var(--border-dim)] text-[var(--text-primary)] px-3 py-2 rounded-lg border border-[var(--border-dim)] transition-all w-max shadow-sm"
      >
        <div className="bg-blue-500/20 p-1 rounded-md text-blue-500">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <span className="truncate max-w-[160px]">{source.title}</span>
        <span className="text-[var(--text-secondary)] font-normal">p.{source.page}</span>
        {source.score !== 0 && (
          <span className="text-blue-500 ml-1 bg-blue-500/10 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wide">
            {scorePct}
          </span>
        )}
      </button>

      {expanded && (
        <div className="text-xs text-[var(--text-primary)] bg-[var(--bg-background)] p-4 rounded-xl border border-[var(--border-dim)] whitespace-pre-wrap leading-relaxed w-full shadow-inner animate-in fade-in mt-1">
          {source.content}
        </div>
      )}
    </div>
  );
};

// --- NEW MESSAGE ACTIONS COMPONENT ---
const MessageActions = ({ content, onRegenerate }: { content: string, onRegenerate: () => void }) => {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--border-dim)] text-[var(--text-secondary)]">
      <button onClick={handleCopy} className="hover:text-[var(--text-primary)] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-all rounded-md" title="Copy">
        {copied ? (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        )}
      </button>
      <button onClick={onRegenerate} className="hover:text-[var(--text-primary)] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-all rounded-md" title="Regenerate">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
      </button>
      <button onClick={() => setFeedback(feedback === 'up' ? null : 'up')} className={`hover:text-blue-500 transition-colors ${feedback === 'up' ? 'text-blue-500' : ''}`} title="Helpful">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
      </button>
      <button onClick={() => setFeedback(feedback === 'down' ? null : 'down')} className={`hover:text-red-500 transition-colors ${feedback === 'down' ? 'text-red-500' : ''}`} title="Not helpful">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" /></svg>
      </button>
    </div>
  );
};

function App() {
  // --- I18N & THEME STATE ---
  const [lang, setLang] = useState<Language>(() =>
    (localStorage.getItem('asklens_lang') as Language) || 'en'
  );
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('asklens_theme') as Theme) ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );

  const t = translations[lang];

  // Persist Theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('asklens_theme', theme);
  }, [theme]);

  // Persist Lang
  useEffect(() => {
    localStorage.setItem('asklens_lang', lang);
  }, [lang]);

  // --- UI STATE ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [inputValue, setInputValue] = useState('');
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [refreshDocs, setRefreshDocs] = useState(0);
  const [documentCount, setDocumentCount] = useState(0);

  const [autoScroll, setAutoScroll] = useState(true);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, isStreaming, sendMessage, stopStreaming, activeChatId, loadChat, startNewChat } = useChatStream();

  const [dragActive, setDragActive] = useState(false);
  const [globalDroppedFiles, setGlobalDroppedFiles] = useState<File[]>([]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setGlobalDroppedFiles(Array.from(e.dataTransfer.files));
    }
  };

  useEffect(() => {
    if (messages.length === 0) {
      fetch(`${import.meta.env.VITE_API_URL}/documents`)
        .then(res => res.json())
        .then(data => setDocumentCount(data.length || 0))
        .catch(err => console.error("Failed to fetch doc count", err));
    }
  }, [messages.length, refreshDocs]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;
    setAutoScroll(isAtBottom);
  };

  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, autoScroll]);

  const submitMessage = async (overrideQuery?: string) => {
    const query = typeof overrideQuery === 'string' ? overrideQuery : inputValue;
    if (!query.trim() || isStreaming) return;
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setAutoScroll(true);
    await sendMessage(query, selectedDocs);
  };

  const handleRegenerate = () => {
    const lastUserMsg = messages.slice().reverse().find(m => m.role === 'user');
    if (lastUserMsg) submitMessage(lastUserMsg.content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 144)}px`;
    }
  };

  return (
    <div
      className="flex h-screen w-full bg-[var(--bg-background)] relative overflow-hidden transition-colors duration-300"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      <Toaster position="top-right" toastOptions={{ className: 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-dim)] text-sm', duration: 4000 }} />

      {/* DRAG OVERLAY */}
      {dragActive && (
        <div className="absolute inset-0 z-[100] bg-[var(--bg-background)]/90 backdrop-blur-sm flex items-center justify-center border-4 border-blue-500 border-dashed m-4 rounded-3xl transition-all">
          <div className="text-center space-y-4">
            <svg className="w-16 h-16 text-blue-500 mx-auto animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            <h2 className="text-3xl font-bold text-[var(--text-primary)]">{t.dropFiles}</h2>
            <p className="text-[var(--text-secondary)]">{t.dropDesc}</p>
          </div>
        </div>
      )}

      {/* MOBILE OVERLAY */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* SIDEBAR */}
      <div className={`
        fixed md:relative z-50 h-full bg-[var(--bg-surface)] border-r border-[var(--border-dim)] flex flex-col shrink-0 transition-all duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'}
        ${isSidebarOpen ? 'md:w-72' : 'md:w-0 md:border-transparent'}
      `}>
        <div className={`flex flex-col h-full w-72 overflow-hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex-1 overflow-y-auto">
            <ChatSidebar activeChatId={activeChatId} loadChat={(id) => { loadChat(id); setIsMobileMenuOpen(false); }} startNewChat={() => { startNewChat(); setIsMobileMenuOpen(false); }} />
          </div>
          <hr className="border-[var(--border-dim)]" />
          <div className="h-1/3 min-h-[250px] overflow-y-auto">
            <DocumentSidebar selectedDocs={selectedDocs} setSelectedDocs={setSelectedDocs} refreshTrigger={refreshDocs} />
          </div>
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex flex-col flex-1 w-full min-w-0 max-w-4xl mx-auto px-3 sm:px-6 relative">

        {/* HEADER WITH THEME & LANG TOGGLES */}
        <header className="py-3 sm:py-5 border-b border-[var(--border-dim)] mb-2 sm:mb-4 flex justify-between items-center px-2 sm:px-0 transition-all">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] active:scale-95 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>

            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/10 flex items-center justify-center rounded-xl text-blue-500 border border-blue-500/20 shadow-inner">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight leading-tight">AskLens</h1>
              <p className="text-xs sm:text-sm font-medium text-[var(--text-secondary)]">{t.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setLang(lang === 'en' ? 'fr' : 'en')}
              className="p-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] rounded-lg transition-all uppercase"
            >
              {lang}
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] rounded-lg transition-all"
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
          </div>
        </header>

        <main
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto px-4 gap-10">
              <div className="text-center space-y-5">
                <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mx-auto shadow-sm ring-1 ring-blue-500/30">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-2">{t.askAnything}</h2>
                  <p className="text-[var(--text-secondary)] font-medium">
                    {documentCount} {documentCount !== 1 ? t.documents : t.document} {t.readyForAnalysis}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 w-full">
                {t.prompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => submitMessage(prompt.desc)}
                    className="flex flex-col text-left p-4 sm:p-5 rounded-2xl border border-[var(--border-dim)] bg-[var(--bg-surface)] hover:border-gray-500 active:scale-[0.98] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group cursor-pointer shadow-sm"
                  >
                    <span className="text-sm sm:text-base font-semibold text-[var(--text-primary)] mb-1.5 group-hover:text-blue-500 transition-colors">{prompt.title}</span>
                    <span className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">{prompt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg: any, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl max-w-[85%] text-sm leading-relaxed ${msg.role === 'user'
                  ? 'bg-blue-600 text-white ml-auto rounded-br-none'
                  : msg.role === 'error'
                    ? 'bg-red-950/40 text-red-400 border border-red-800/80'
                    : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-dim)] rounded-bl-none'
                  }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="flex flex-col w-full overflow-hidden">
                    <div className="prose prose-invert prose-sm max-w-none text-[var(--text-primary)]">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '')
                            return !inline && match ? (
                              <SyntaxHighlighter
                                {...props}
                                children={String(children).replace(/\n$/, '')}
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                className="rounded-md my-4 border border-[var(--border-dim)] text-xs"
                              />
                            ) : (
                              <code {...props} className="bg-[var(--bg-background)] border border-[var(--border-dim)] rounded px-1.5 py-0.5 text-blue-500 text-xs font-mono">
                                {children}
                              </code>
                            )
                          }
                        }}
                      >
                        {msg.content || ' '}
                      </ReactMarkdown>

                      {isStreaming && idx === messages.length - 1 && (
                        <span className="inline-block w-2 h-4 ml-1 bg-blue-500 animate-pulse align-middle rounded-sm" />
                      )}
                    </div>

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-[var(--border-dim)] flex flex-wrap gap-2">
                        {msg.sources.map((src: any, i: number) => (
                          <SourceChip key={i} source={src} />
                        ))}
                      </div>
                    )}

                    {!isStreaming && <MessageActions content={msg.content} onRegenerate={handleRegenerate} />}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} className="h-4" />
        </main>

        <div className="pt-2 pb-6 px-0 sm:px-4 bg-[var(--bg-background)] border-t border-[var(--border-dim)] sticky bottom-0 z-20">
          <div className="max-w-3xl mx-auto w-full relative">

            {isStreaming && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10">
                <button
                  onClick={stopStreaming}
                  className="flex items-center gap-2 text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-dim)] px-4 py-2 rounded-full hover:bg-[var(--border-dim)] transition shadow-lg"
                >
                  <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /></svg>
                  Stop generating
                </button>
              </div>
            )}

            <div className="relative flex items-end gap-2 bg-[var(--bg-surface)] border border-[var(--border-dim)] rounded-2xl p-2 shadow-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
              <div className="mb-1">
                <FileUploader
                  onUploadSuccess={() => setRefreshDocs(prev => prev + 1)}
                  droppedFiles={globalDroppedFiles}
                  onClearDropped={() => setGlobalDroppedFiles([])}
                />
              </div>

              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                placeholder={t.inputPlaceholder}
                className="flex-1 bg-transparent border-none focus:outline-none resize-none py-2.5 px-1 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] max-h-[144px] min-h-[40px] overflow-y-auto"
                rows={1}
              />

              <button
                onClick={() => submitMessage()}
                disabled={isStreaming || !inputValue.trim()}
                className={`mb-1 p-2 rounded-xl flex items-center justify-center transition-all duration-200 ${!inputValue.trim() || isStreaming
                  ? 'bg-[var(--bg-background)] border border-[var(--border-dim)] text-[var(--text-muted)] cursor-not-allowed opacity-50'
                  : 'bg-blue-600 text-white hover:bg-blue-500 shadow-md cursor-pointer active:scale-95'
                  }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
