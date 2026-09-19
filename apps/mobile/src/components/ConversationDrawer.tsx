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
  onRename,
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
    <div className="fixed inset-0 z-50 flex antialiased">
      {/* 背景半透明遮罩 */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity"
      />

      {/* 侧边滑出抽屉 (ui-skills style) */}
      <div className="relative w-4/5 max-w-xs bg-white h-full border-r border-[#EDEDED] shadow-xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
        {/* 抽屉头部 */}
        <div className="safe-top px-4 py-3 border-b border-[#EDEDED] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#F5F5F5] text-[#151515] flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-sm text-[#151515]">会话历史</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-[#757575] hover:text-[#151515] rounded-md hover:bg-[#F5F5F5] transition-colors cursor-pointer"
            aria-label="关闭抽屉"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 开启新会话按钮 (纯黑实体反色按钮，无任何渐变) */}
        <div className="p-3">
          <button
            onClick={() => {
              onNew();
              onClose();
            }}
            className="w-full h-9 flex items-center justify-center gap-1.5 bg-[#151515] hover:bg-black text-white rounded-lg text-xs font-medium transition-colors cursor-pointer active:scale-[0.99]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建对话</span>
          </button>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
          <div className="text-[10px] font-mono uppercase text-[#A5A5A5] px-2 py-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>ALL SESSIONS</span>
          </div>

          {conversations.length === 0 ? (
            <div className="text-center py-10 text-xs text-[#A5A5A5]">暂无历史会话</div>
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
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[#F5F5F5] text-[#151515] font-semibold border border-[#EDEDED]'
                      : 'text-[#757575] hover:bg-[#FAFAFA] hover:text-[#151515] border border-transparent'
                  }`}
                >
                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-1 mr-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        autoFocus
                        className="w-full bg-white border border-[#151515] rounded px-1.5 py-0.5 text-xs text-[#151515] outline-none"
                      />
                      <button
                        onClick={(e) => handleConfirmRename(c.id, e)}
                        className="p-1 hover:text-black text-[#757575]"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="truncate flex-1 pr-2">{c.title || '新对话'}</span>
                  )}

                  {!isEditing && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleStartRename(c, e)}
                        className="p-1 text-[#A5A5A5] hover:text-[#151515] rounded transition-colors"
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
                          className="p-1 text-[#A5A5A5] hover:text-[#CF1322] rounded transition-colors"
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
