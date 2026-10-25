import { useRef, useState } from 'react';
import type { ChatMessage } from '../types';

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadChat = async (chatId: string) => {
    setActiveChatId(chatId);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/chats/${chatId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.map((m: any) => ({ role: m.role, content: m.content })));
      }
    } catch (e) {
      console.error('Failed to load chat messages:', e);
    }
  };

  const startNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
  };

  const sendMessage = async (query: string) => {
    if (!query.trim()) return;

    let currentChatId = activeChatId;

    // 1. Create a new chat session in Supabase if one doesn't exist
    if (!currentChatId) {
      try {
        const title = query.length > 30 ? query.substring(0, 30) + '...' : query;
        const res = await fetch(`${import.meta.env.VITE_API_URL}/chats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        if (res.ok) {
          const newChat = await res.json();
          currentChatId = newChat.id;
          setActiveChatId(currentChatId);
        }
      } catch (e) {
        console.error("Failed to create chat", e);
      }
    }

    // 2. Save the User's message to Supabase
    if (currentChatId) {
      await fetch(`${import.meta.env.VITE_API_URL}/chats/${currentChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: query })
      });
    }

    const historyPayload = messages
      .filter((msg) => msg.role !== 'error')
      .map((msg) => ({ role: msg.role, content: msg.content }));

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: query },
      { role: 'assistant', content: '' }
    ]);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let fullAiResponse = "";

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, history: historyPayload }),
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      if (!response.body) throw new Error("No readable stream available");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() || '';

          for (const part of parts) {
              const cleanPart = part.trim();
              if (cleanPart.startsWith('event: error')) {
                  const dataLine = cleanPart.split(/\r?\n/).find(line => line.startsWith('data:'));
                  if (dataLine) {
                      const errorMessage = dataLine.replace(/^data:\s*/, '');
                      setMessages(prev => {
                          const updated = [...prev];
                          updated[updated.length - 1] = { role: 'error', content: errorMessage };
                          return updated;
                      });
                      setIsStreaming(false);
                      return;
                  }
              } else if (cleanPart.startsWith('data:')) {
                  const chunkText = cleanPart
                      .split(/\r?\n/)
                      .map(line => line.replace(/^data:\s*/, ''))
                      .join('\n');

                  fullAiResponse += chunkText;

                  setMessages((prev) => {
                      const updatedMessages = [...prev];
                      const lastIndex = updatedMessages.length - 1;
                      updatedMessages[lastIndex] = {
                          ...updatedMessages[lastIndex],
                          content: updatedMessages[lastIndex].content + chunkText,
                      };
                      return updatedMessages;
                  });
              }
          }
      }

      // 3. Save the final AI response to Supabase after the stream finishes
      if (currentChatId && fullAiResponse) {
        await fetch(`${import.meta.env.VITE_API_URL}/chats/${currentChatId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'assistant', content: fullAiResponse })
        });
      }

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Stream failure:', error);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'error', content: "Connection to the server failed." };
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const stopStreaming = () => abortControllerRef.current?.abort();

  return { messages, isStreaming, sendMessage, stopStreaming, activeChatId, loadChat, startNewChat };
}
