import { useEffect, useState } from 'react';

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

interface ChatSidebarProps {
  activeChatId: string | null;
  loadChat: (id: string) => void;
  startNewChat: () => void;
}

export function ChatSidebar({ activeChatId, loadChat, startNewChat }: ChatSidebarProps) {
  const [chats, setChats] = useState<Chat[]>([]);

  const fetchChats = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/chats`);
      if (response.ok) setChats(await response.json());
    } catch (error) {
      console.error(error);
    }
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat history?')) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/chats/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setChats(prev => prev.filter(c => c.id !== id));
        if (activeChatId === id) startNewChat();
      }
    } catch (error) {
      console.error(error);
    }
  };

  // Re-fetch the list when the active chat changes (so newly created chats appear instantly)
  useEffect(() => {
    fetchChats();
  }, [activeChatId]);

  return (
    <div className="flex flex-col flex-1 p-4 overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-200">Chat History</h2>
        <button
          onClick={startNewChat}
          className="text-xs font-semibold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 transition"
        >
          + New Chat
        </button>
      </div>
      <ul className="space-y-2 overflow-y-auto flex-1 pr-2">
        {chats.map((chat) => (
          <li
            key={chat.id}
            onClick={() => loadChat(chat.id)}
            className={`p-3 rounded-lg border flex justify-between items-start group cursor-pointer transition ${
              activeChatId === chat.id
                ? 'bg-primary/20 border-primary/50 text-white'
                : 'bg-gray-900/50 border-gray-800 text-gray-300 hover:bg-gray-800'
            }`}
          >
            <span className="text-sm truncate font-medium" title={chat.title}>{chat.title}</span>
            <button
              onClick={(e) => deleteChat(chat.id, e)}
              className="text-red-500/70 hover:text-red-400 p-1 -mt-1 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
