import { useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface Source {
  id?: string;
  document_id?: string;
  title: string;
  page: number;
  content: string;
  score?: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
  sources?: Source[];
}

export interface Chat {
  id: string;
  title: string;
  updated_at: string;
  messages: Message[];
}

export const useChatStream = () => {
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('asklens_chats');
    if (stored) {
      try {
        setChats(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const persistChat = (chatId: string, title: string, chatMessages: Message[]) => {
    setChats(prev => {
      const existing = prev[chatId];
      const next = {
        ...prev,
        [chatId]: {
          id: chatId,
          title: existing?.title || title,
          updated_at: new Date().toISOString(),
          messages: chatMessages,
        },
      };
      localStorage.setItem('asklens_chats', JSON.stringify(next));
      window.dispatchEvent(new Event('storage'));
      return next;
    });
  };

  const startNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setStatusText('');
  };

  const loadChat = (id: string) => {
    const stored = localStorage.getItem('asklens_chats');
    const latestChats = stored ? JSON.parse(stored) : chats;
    if (latestChats[id]) {
      setActiveChatId(id);
      setMessages(latestChats[id].messages);
      setStatusText('');
    }
  };

  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      setStatusText('');
    }
  };

  const sendMessage = async (query: string, documentIds: string[], lang: string) => {
    if (!query.trim()) return;

    let chatId = activeChatId;
    if (!chatId) {
      chatId = Date.now().toString();
      setActiveChatId(chatId);
    }

    const newMsg: Message = { role: 'user', content: query };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setIsStreaming(true);
    setStatusText(lang === 'fr' ? 'Initialisation...' : 'Initiating...');

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, document_ids: documentIds, lang }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantMsg: Message = { role: 'assistant', content: '', sources: [] };
      setMessages([...updatedMessages, assistantMsg]);

      const processLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const parsed = JSON.parse(line);
          if (parsed.event === 'status') {
            setStatusText(parsed.data);
          } else if (parsed.event === 'message') {
            setStatusText('');
            assistantMsg = { ...assistantMsg, content: assistantMsg.content + parsed.data };
            setMessages([...updatedMessages, assistantMsg]);
          } else if (parsed.event === 'sources') {
            assistantMsg = { ...assistantMsg, sources: Array.isArray(parsed.data) ? parsed.data : [] };
            setMessages([...updatedMessages, assistantMsg]);
          } else if (parsed.event === 'error') {
            setStatusText('');
            setMessages([...updatedMessages, { role: 'error', content: parsed.data }]);
          }
        } catch (e) {
          console.error('JSON Parse error on stream line:', line, e);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in the buffer until the next chunk
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          processLine(line);
        }
      }

      // Flush any remaining buffered line when stream closes
      if (buffer.trim()) {
        processLine(buffer);
      }

      persistChat(chatId, query.slice(0, 40), [...updatedMessages, assistantMsg]);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatusText('Stopped');
      } else {
        setMessages([...updatedMessages, { role: 'error', content: 'Connection to the server failed.' }]);
      }
    } finally {
      setIsStreaming(false);
      setStatusText('');
      abortControllerRef.current = null;
    }
  };

  return { chats, activeChatId, messages, isStreaming, statusText, sendMessage, stopStreaming, loadChat, startNewChat };
};
