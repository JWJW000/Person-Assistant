import React, { FC, useState, useEffect, useRef, useMemo } from 'react';
import { ConversationItem, useAppStore } from '../store';
import { ConfirmModal } from './ConfirmModal';
import {
  SquarePen,
  Search,
  Trash2,
  X,
  Edit2,
  Check,
  Database,
  Settings,
  LogOut,
  ChevronRight,
  Brain,
  Bot,
} from 'lucide-react';

interface ConversationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onOpenKnowledge?: () => void;
  onOpenMemory?: () => void;
  onOpenSettings?: () => void;
  onOpenPi?: () => void;
}

export const ConversationDrawer: FC<ConversationDrawerProps> = ({
  isOpen,
  onClose,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onOpenKnowledge,
  onOpenMemory,
  onOpenSettings,
  onOpenPi,
}) => {
  const { conversations, activeConversationId, currentUser, logout } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
    confirmText?: string;
    variant?: 'danger' | 'warning';
    iconType?: 'logout' | 'delete' | 'reset' | 'warning';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    content: '',
    onConfirm: () => {},
  });

  // --- 柔和进出动画：用 CSS transition 而不是条件卸载 ---
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (isOpen) {
      // 打开：先挂载 DOM，下一帧激活 transition
      setMounted(true);
      clearTimeout(timerRef.current);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      // 关闭：先触发 transition out，结束后卸载 DOM
      setVisible(false);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMounted(false), 240);
    }
    return () => clearTimeout(timerRef.current);
  }, [isOpen]);

  // 过滤并按时间分组
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const groups = useMemo(() => {
    const today: ConversationItem[] = [];
    const yesterday: ConversationItem[] = [];
    const past7Days: ConversationItem[] = [];
    const older: ConversationItem[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const sevenDaysAgo = todayStart - 6 * 86400000;

    filteredList.forEach((c) => {
      const time = c.created_at ? new Date(c.created_at).getTime() : 0;
      if (time >= todayStart) {
        today.push(c);
      } else if (time >= yesterdayStart) {
        yesterday.push(c);
      } else if (time >= sevenDaysAgo) {
        past7Days.push(c);
      } else {
        older.push(c);
      }
    });

    return [
      { title: '今天', items: today },
      { title: '昨天', items: yesterday },
      { title: '前 7 天', items: past7Days },
      { title: '更早记录', items: older },
    ].filter((g) => g.items.length > 0);
  }, [filteredList]);

  if (!mounted) return null;

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

  const userInitial = (currentUser || 'A').slice(0, 1).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex antialiased">
      {/* 遮罩层 (点击关闭，柔和淡入淡出) */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 transition-opacity duration-200 ease-out"
        style={{ opacity: visible ? 1 : 0 }}
      />

      {/* 侧边抽屉面板 (柔和滑入滑出) */}
      <div
        className="relative w-[85%] max-w-xs bg-[#FBFBFB] h-full border-r border-black/[0.06] shadow-2xl flex flex-col z-10 transition-transform duration-200 ease-out"
        style={{ transform: visible ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        {/* 抽屉顶部功能栏：新建对话与搜索 */}
        <div className="safe-top px-3.5 pt-3 pb-2 flex flex-col gap-2.5 border-b border-black/[0.04] bg-white">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                onNew();
                onClose();
              }}
              className="flex items-center gap-2 h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 active:scale-95 transition-all text-slate-800 text-xs font-semibold cursor-pointer"
            >
              <SquarePen className="w-4 h-4 text-slate-700" />
              <span>开启新对话</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 实时搜索框 */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索对话..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100/80 border border-transparent focus:border-slate-300 focus:bg-white rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* 会话列表 (按时间轴自然分组) */}
        <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-4">
          {filteredList.length === 0 ? (
            <div className="text-center py-16 text-xs text-slate-400">
              {searchQuery ? '未找到相关对话' : '暂无历史对话记录'}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.title} className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-400 px-3 py-1 tracking-tight">
                  {g.title}
                </div>

                {g.items.map((c) => {
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
                      className={`group flex items-center justify-between px-3 py-2 rounded-xl text-[13px] cursor-pointer transition-all ${
                        isActive
                          ? 'bg-slate-200/80 text-slate-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200/60'
                      }`}
                    >
                      {isEditing ? (
                        <div
                          className="flex-1 flex items-center gap-1 mr-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            autoFocus
                            className="w-full bg-white border border-slate-400 rounded-lg px-2 py-0.5 text-xs text-slate-900 outline-none font-normal"
                          />
                          <button
                            onClick={(e) => handleConfirmRename(c.id, e)}
                            className="p-1 hover:text-black text-slate-600"
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
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                            title="重命名"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {c.id !== 'default' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmConfig({
                                  isOpen: true,
                                  title: '删除会话',
                                  content: `确定删除会话「${c.title}」吗？删除后该记录无法恢复。`,
                                  confirmText: '删除',
                                  variant: 'danger',
                                  iconType: 'delete',
                                  onConfirm: () => onDelete(c.id),
                                });
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="删除会话"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* 抽屉底部：管理工具与个人账号快捷入口 */}
        <div className="safe-bottom p-2.5 border-t border-black/[0.04] bg-white flex flex-col gap-1">
          {/* Hermes 三层记忆快捷入口 */}
          {onOpenPi && (
            <button
              onClick={() => { onOpenPi(); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Bot className="w-4 h-4" />
              <span className="flex-1 text-left">Pi 任务</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          )}

          {onOpenMemory && (
            <button
              onClick={() => {
                onOpenMemory();
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Brain className="w-3.5 h-3.5" />
                </div>
                <span>AI 记忆 (Hermes)</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}

          {/* 知识库快捷入口 */}
          {onOpenKnowledge && (
            <button
              onClick={() => {
                onOpenKnowledge();
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Database className="w-3.5 h-3.5" />
                </div>
                <span>知识库管理</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}

          {/* 系统设置快捷入口 */}
          {onOpenSettings && (
            <button
              onClick={() => {
                onOpenSettings();
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Settings className="w-3.5 h-3.5" />
                </div>
                <span>系统设置</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}

          {/* 用户信息卡片 */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-100/80 transition-colors mt-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                {userInitial}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-900 truncate">
                  {currentUser || 'admin'}
                </span>
                <span className="text-[10px] text-emerald-600 font-medium">账号正常</span>
              </div>
            </div>

            <button
              onClick={() => {
                setConfirmConfig({
                  isOpen: true,
                  title: '退出登录',
                  content: '确定退出当前账号吗？退出后需要重新输入账号密码登录。',
                  confirmText: '退出登录',
                  variant: 'danger',
                  iconType: 'logout',
                  onConfirm: () => {
                    logout();
                    onClose();
                  },
                });
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="退出登录"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        content={confirmConfig.content}
        confirmText={confirmConfig.confirmText}
        variant={confirmConfig.variant}
        iconType={confirmConfig.iconType}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
