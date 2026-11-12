import { useState, useRef, useEffect } from 'react';

export interface Source {
  title: string;
  page: number;
  content: string;
  score: number;
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

  const saveChats = (newChats: Record<string, Chat>) => {
    setChats(newChats);
    localStorage.setItem('asklens_chats', JSON.stringify(newChats));
    window.dispatchEvent(new Event('storage'));
  };

  const startNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setStatusText('');
  };

  const loadChat = (id: string) => {
    if (chats[id]) {
      setActiveChatId(id);
      setMessages(chats[id].messages);
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
    setStatusText('Initiating...');

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(import.meta.env.VITE_API_URL + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, document_ids: documentIds, lang }),
        signal: abortControllerRef.current.signal
      });

      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg: Message = { role: 'assistant', content: '', sources: [] };
      setMessages([...updatedMessages, assistantMsg]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.event === 'status') {
              setStatusText(parsed.data);
            } else if (parsed.event === 'message') {
              setStatusText('');
              assistantMsg.content += parsed.data;
              setMessages([...updatedMessages, { ...assistantMsg }]);
            } else if (parsed.event === 'sources') {
              assistantMsg.sources = parsed.data;
              setMessages([...updatedMessages, { ...assistantMsg }]);
            } else if (parsed.event === 'error') {
              setStatusText('');
              setMessages([...updatedMessages, { role: 'error', content: parsed.data }]);
            }
          } catch (e) {
            console.error('JSON Parse error on stream', line);
          }
        }
      }

      const finalChats = { ...chats };
      finalChats[chatId] = {
        id: chatId,
        title: finalChats[chatId]?.title || query.slice(0, 40),
        updated_at: new Date().toISOString(),
        messages: [...updatedMessages, assistantMsg]
      };
      saveChats(finalChats);

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
