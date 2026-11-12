import React, { useEffect, useState, useRef } from 'react';
import { MessageSquare, MoreVertical, Plus, Trash2, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Chat { id: string; title: string; updated_at: string; messages: any[] }

interface ChatSidebarProps {
  activeChatId: string | null;
  loadChat: (id: string) => void;
  startNewChat: () => void;
  t: any;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ activeChatId, loadChat, startNewChat, t }) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const loadStored = () => {
    try {
      const raw = localStorage.getItem('asklens_chats');
      if (!raw) return setChats([]);
      const parsed = JSON.parse(raw);
      const list = Object.values(parsed) as Chat[];
      list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      setChats(list);
    } catch (e) { setChats([]); }
  };

  useEffect(() => {
    loadStored();
    window.addEventListener('storage', loadStored);
    return () => window.removeEventListener('storage', loadStored);
  }, [activeChatId]);

  useEffect(() => {
    const clickOut = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    };
    document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, []);

  const saveChats = (list: Chat[]) => {
    const obj = list.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
    localStorage.setItem('asklens_chats', JSON.stringify(obj));
    setChats(list);
    window.dispatchEvent(new Event('storage'));
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this chat?')) return;
    saveChats(chats.filter(c => c.id !== id));
    if (activeChatId === id) startNewChat();
    setMenuOpenId(null);
  };

  const handleRename = (id: string) => {
    if (!editTitle.trim()) { setEditingId(null); return; }
    saveChats(chats.map(c => c.id === id ? { ...c, title: editTitle.trim() } : c));
    setEditingId(null);
    setMenuOpenId(null);
  };

  const categorize = () => {
    const groups: Record<string, Chat[]> = { 'Today': [], 'Yesterday': [], 'Previous 7 Days': [], 'Older': [] };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today); lastWeek.setDate(lastWeek.getDate() - 7);

    chats.forEach(c => {
      const d = new Date(c.updated_at);
      if (d >= today) groups['Today'].push(c);
      else if (d >= yesterday) groups['Yesterday'].push(c);
      else if (d >= lastWeek) groups['Previous 7 Days'].push(c);
      else groups['Older'].push(c);
    });
    return groups;
  };

  const groups = categorize();

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)]">
      <div className="p-4 sticky top-0 bg-[var(--bg-surface)] z-10">
        <button onClick={startNewChat} className="w-full flex items-center justify-between px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-xl transition-all border border-blue-500/20 font-medium active:scale-[0.98]">
          <span className="flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> {t.newChat}</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {chats.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)] px-2">{t.noChats}</p>
        ) : (
          Object.entries(groups).map(([label, list]) => list.length > 0 && (
            <div key={label} className="mb-3">
              <h3 className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-2 mb-1.5">{label}</h3>
              <div className="space-y-1">
                {list.map(c => (
                  <div key={c.id} className="relative group" ref={menuOpenId === c.id ? menuRef : null}>
                    <button onClick={() => loadChat(c.id)} className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${activeChatId === c.id ? 'bg-blue-500/15 text-blue-500 font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--border-dim)] hover:text-[var(--text-primary)]'}`}>
                      {editingId === c.id ? (
                        <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={() => handleRename(c.id)} onKeyDown={e => e.key === 'Enter' && handleRename(c.id)} className="bg-[var(--bg-background)] border border-blue-500 text-[var(--text-primary)] px-2 py-0.5 rounded text-sm w-full outline-none" onClick={e => e.stopPropagation()} />
                      ) : (
                        <span className="truncate text-sm pr-2 flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5 opacity-70" /> {c.title}</span>
                      )}
                      {!editingId && (
                        <div onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === c.id ? null : c.id); }} className={`p-1 rounded hover:text-[var(--text-primary)] transition-opacity ${menuOpenId === c.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <MoreVertical className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                    {menuOpenId === c.id && (
                      <div className="absolute right-2 top-8 w-32 bg-[var(--bg-surface)] border border-[var(--border-dim)] rounded-lg shadow-xl py-1 z-50">
                        <button onClick={e => { e.stopPropagation(); setEditTitle(c.title); setEditingId(c.id); setMenuOpenId(null); }} className="w-full text-left px-4 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--border-dim)] flex items-center gap-2"><Edit2 className="w-3.5 h-3.5" /> Rename</button>
                        <button onClick={e => handleDelete(c.id, e)} className="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-[var(--border-dim)] flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
