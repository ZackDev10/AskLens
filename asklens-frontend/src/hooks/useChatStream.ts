import { useRef, useState } from 'react';
import type { ChatMessage } from '../types';

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = async (query: string) => {
    if (!query.trim()) return;

    // Capture the current conversation history before adding the new query
    // Filter out any error messages to prevent breaking the backend format
    const historyPayload = messages
      .filter((msg) => msg.role !== 'error')
      .map((msg) => ({ role: msg.role, content: msg.content }));

    // Immediately add the user's query and an empty assistant placeholder to the UI
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: query },
      { role: 'assistant', content: '' }
    ]);
    setIsStreaming(true);

    // Set up an AbortController so we can cancel long generations
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Inject the mapped history into the JSON body
        body: JSON.stringify({ query, history: historyPayload }),
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      if (!response.body) throw new Error("No readable stream available");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // The core stream loop
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode the raw bytes and append to our buffer
        buffer += decoder.decode(value, { stream: true });

        // Split on either \r\n\r\n (Windows) OR \n\n (Linux/Mac)
        const parts = buffer.split(/\r?\n\r?\n/);

        // Pop the last element (which might be an incomplete chunk) back into the buffer
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

  return { messages, isStreaming, sendMessage, stopStreaming };
}
