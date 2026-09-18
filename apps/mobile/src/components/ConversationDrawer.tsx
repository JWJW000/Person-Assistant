import React, { FC, useState } from 'react';
import { ConversationItem, useAppStore } from '../store';
import { MessageSquare, Plus, Trash2, X, Clock, Edit2, Check } from 'lucide-react';

interface ConversationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
}

export const ConversationDrawer: FC<ConversationDrawerProps> = ({
  isOpen,
  onClose,
  onSelect,
  onNew,
  onDelete,
  onRename
}) => {
  const { conversations, activeConversationId } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  if (!isOpen) return null;

  const handleStartRename = (c: ConversationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditTitle(c.title);
  };

  const handleConfirmRename = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      onRename(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* 背景蒙层 */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      {/* 侧边滑出卡片 */}
      <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-250 ease-out">
        {/* 抽屉头部 */}
        <div className="safe-top p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-slate-900">会话管理</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 新建会话按钮 */}
        <div className="p-3">
          <button
            onClick={() => {
              onNew();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-semibold shadow-xs shadow-blue-500/20 active:scale-98 transition-transform cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>开启新会话</span>
          </button>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1.5">
          <div className="text-[10px] font-semibold text-slate-400 px-2 py-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>历史会话</span>
          </div>

          {conversations.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">暂无其他会话</div>
          ) : (
            conversations.map((c: ConversationItem) => {
              const isActive = c.id === activeConversationId;
              const isEditing = editingId === c.id;

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (!isEditing) {
                      onSelect(c.id);
                      onClose();
                    }
                  }}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs cursor-pointer transition-all ${
                    isActive
                      ? 'bg-blue-50/80 text-blue-600 font-semibold border border-blue-200/60'
                      : 'text-slate-700 hover:bg-slate-100/80 border border-transparent'
                  }`}
                >
                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-1 mr-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        autoFocus
                        className="w-full bg-white border border-blue-400 rounded-md px-1.5 py-0.5 text-xs text-slate-900 outline-none"
                      />
                      <button
                        onClick={(e) => handleConfirmRename(c.id, e)}
                        className="p-1 hover:text-emerald-600 text-slate-500"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="truncate flex-1 pr-2">{c.title || '新会话'}</span>
                  )}

                  {!isEditing && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleStartRename(c, e)}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded"
                        title="重命名"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>

                      {c.id !== 'default' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`确定删除会话「${c.title}」吗？`)) {
                              onDelete(c.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="删除会话"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
