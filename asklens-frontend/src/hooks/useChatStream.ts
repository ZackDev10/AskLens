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

  const sendMessage = async (query: string, selectedDocIds: string[] = []) => {
    if (!query.trim()) return;
    let currentChatId = activeChatId;

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
        body: JSON.stringify({
          query,
          history: historyPayload,
          document_ids: selectedDocIds
        }),
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
                updated[updated.length - 1] = { ...updated[updated.length - 1], role: 'error', content: errorMessage };
                return updated;
              });
              setIsStreaming(false);
              return;
            }
          }
          // --- Handle Sources Event ---
          else if (cleanPart.startsWith('event: sources')) {
            const dataLine = cleanPart.split(/\r?\n/).find(line => line.startsWith('data:'));
            if (dataLine) {
              try {
                const sourcesJson = dataLine.replace(/^data:\s*/, '');
                const sources = JSON.parse(sourcesJson);
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIndex = updated.length - 1;
                  updated[lastIndex] = { ...updated[lastIndex], sources } as any;
                  return updated;
                });
              } catch (e) {
                console.error("Failed to parse sources", e);
              }
            }
          }
          // --- Normal Text Stream ---
          else if (cleanPart.startsWith('data:')) {
            const chunkText = cleanPart
              .split(/\r?\n/)
              // FIX: Use / ?/ to strip at most ONE space, preserving token spaces
              .map(line => line.replace(/^data: ?/, ''))
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
          updated[updated.length - 1] = { ...updated[updated.length - 1], role: 'error', content: "Connection to the server failed." };
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
