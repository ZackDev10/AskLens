import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DocumentSidebar } from './components/DocumentSidebar'; // 1. Import the sidebar
import { FileUploader } from './components/FileUploader';
import { useChatStream } from './hooks/useChatStream';

function App() {
  const [inputValue, setInputValue] = useState('');
  const { messages, isStreaming, sendMessage, stopStreaming } = useChatStream();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming) return;

    const query = inputValue;
    setInputValue('');
    await sendMessage(query);
  };

  return (
    // 2. Wrap the entire app in a flex row to place the sidebar on the left
    <div className="flex h-screen w-full bg-background">

      {/* 3. Insert the sidebar component */}
      <DocumentSidebar />

      {/* 4. Keep your existing chat layout in the main flex-1 container */}
      <div className="flex flex-col flex-1 max-w-4xl mx-auto p-4 relative">
        <header className="py-4 border-b border-gray-800 mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-primary">AskLens</h1>
            <p className="text-sm text-gray-400">RAG Document Assistant</p>
          </div>
          {isStreaming && (
            <button
              onClick={stopStreaming}
              className="text-xs bg-red-900/40 text-red-300 border border-red-700/60 px-3 py-1.5 rounded-md hover:bg-red-900/60 transition"
            >
              Stop Generating
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
              <span className="text-lg font-medium text-gray-400">No messages yet</span>
              <p className="text-sm">Ask a question to query your indexed documents.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl max-w-[85%] text-sm leading-relaxed ${msg.role === 'user'
                  ? 'bg-primary text-white ml-auto rounded-br-none'
                  : msg.role === 'error'
                    ? 'bg-red-950/40 text-red-200 border border-red-800/80'
                    : 'bg-surface text-gray-200 border border-gray-800 rounded-bl-none'
                  }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none space-y-2">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content || ' '}
                    </ReactMarkdown>
                    {isStreaming && idx === messages.length - 1 && (
                      <span className="inline-block w-1.5 h-4 ml-1 bg-primary animate-pulse align-middle" />
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </main>

        <div className="max-w-3xl mx-auto w-full px-4 mb-2">
          <FileUploader />
        </div>
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isStreaming}
            placeholder="Ask a question about your documents..."
            className="flex-1 bg-surface border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50 transition"
          />
          <button
            type="submit"
            disabled={isStreaming || !inputValue.trim()}
            className="bg-primary text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
