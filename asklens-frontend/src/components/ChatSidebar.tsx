import React, { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';

interface Chat {
  id: string;
  title: string;
  updated_at: string;
}

interface ChatSidebarProps {
  activeChatId: string | null;
  loadChat: (id: string) => void;
  startNewChat: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ activeChatId, loadChat, startNewChat }) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchChats = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/chats`);
      const data = await res.json();
      setChats(data || []);
    } catch (err) {
      console.error("Failed to load chats", err);
    }
  };

  useEffect(() => {
    fetchChats();
  }, [activeChatId]); // Refetch when chat changes to capture auto-titles

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/chats/${id}`, { method: 'DELETE' });
      setChats(chats.filter(c => c.id !== id));
      if (activeChatId === id) startNewChat();
      toast.success("Chat deleted");
    } catch (err) {
      toast.error("Failed to delete chat");
    }
    setMenuOpenId(null);
  };

  const handleRenameSubmit = async (id: string) => {
    if (!editTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/chats/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim() })
      });
      setChats(chats.map(c => c.id === id ? { ...c, title: editTitle.trim() } : c));
      toast.success("Renamed successfully");
    } catch (err) {
      toast.error("Failed to rename chat");
    }
    setEditingId(null);
    setMenuOpenId(null);
  };

  // Grouping Logic
  const categorizeChats = () => {
    const groups: Record<string, Chat[]> = {
      'Today': [],
      'Yesterday': [],
      'Previous 7 Days': [],
      'Older': []
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const lastWeek = today - (7 * 86400000);

    chats.forEach(chat => {
      // Use updated_at or created_at depending on your DB
      const chatDate = new Date(chat.updated_at).getTime();
      if (chatDate >= today) groups['Today'].push(chat);
      else if (chatDate >= yesterday) groups['Yesterday'].push(chat);
      else if (chatDate >= lastWeek) groups['Previous 7 Days'].push(chat);
      else groups['Older'].push(chat);
    });

    return groups;
  };

  const groupedChats = categorizeChats();

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 sticky top-0 bg-surface z-10">
        <button
          onClick={startNewChat}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl transition-colors border border-primary/20 font-medium"
        >
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Chat
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-6">
        {Object.entries(groupedChats).map(([label, groupChats]) => (
          groupChats.length > 0 && (
            <div key={label} className="mb-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
                {label}
              </h3>
              <div className="space-y-1">
                {groupChats.map(chat => (
                  <div key={chat.id} className="relative group" ref={menuOpenId === chat.id ? menuRef : null}>
                    <button
                      onClick={() => loadChat(chat.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${activeChatId === chat.id
                          ? 'bg-gray-800 text-gray-100'
                          : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                        }`}
                    >
                      {editingId === chat.id ? (
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => handleRenameSubmit(chat.id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(chat.id)}
                          className="bg-black border border-primary text-gray-100 px-2 py-0.5 rounded text-sm w-full outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="truncate text-sm pr-4">
                          {chat.title || 'New Chat'}
                        </span>
                      )}

                      {/* Kebab Menu Button (visible on hover or when active) */}
                      {!editingId && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === chat.id ? null : chat.id);
                          }}
                          className={`p-1 rounded hover:text-white transition-opacity ${menuOpenId === chat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                        </div>
                      )}
                    </button>

                    {/* Dropdown Menu */}
                    {menuOpenId === chat.id && (
                      <div className="absolute right-2 top-10 w-32 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 z-50">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditTitle(chat.title);
                            setEditingId(chat.id);
                            setMenuOpenId(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          Rename
                        </button>
                        <button
                          onClick={(e) => handleDelete(chat.id, e)}
                          className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
};
