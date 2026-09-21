import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { fetchMyMemory, updateMemory, clearMemory, UserMemoryData } from '../lib/aiApi';
import { Toast, ToastMessage } from '../components/Toast';
import {
  ArrowLeft,
  Brain,
  User,
  Bookmark,
  Sparkles,
  RefreshCw,
  Edit3,
  Check,
  X,
  RotateCcw,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react';

interface MemoryPageProps {
  onBack: () => void;
}

type TabType = 'user_profile' | 'fact_lessons' | 'soul';

export const MemoryPage: React.FC<MemoryPageProps> = ({ onBack }) => {
  const { serverUrl, accessToken } = useAppStore();
  const [memory, setMemory] = useState<UserMemoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('user_profile');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const loadMemory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMyMemory(serverUrl, accessToken);
      if (data) {
        setMemory(data);
      }
    } catch {
      setToast({ id: String(Date.now()), type: 'error', text: '获取记忆数据失败' });
    } finally {
      setLoading(false);
    }
  }, [serverUrl, accessToken]);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  const getCurrentContent = () => {
    if (!memory) return '';
    if (activeTab === 'soul') return memory.soul || '';
    if (activeTab === 'user_profile') return memory.userProfile || '';
    if (activeTab === 'fact_lessons') return memory.factLessons || '';
    return '';
  };

  const handleStartEdit = () => {
    setEditContent(getCurrentContent());
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const success = await updateMemory(serverUrl, accessToken, activeTab, editContent);
      if (success) {
        setToast({ id: String(Date.now()), type: 'success', text: '记忆更新成功' });
        setEditing(false);
        await loadMemory();
      } else {
        setToast({ id: String(Date.now()), type: 'error', text: '保存失败，请稍后重试' });
      }
    } catch {
      setToast({ id: String(Date.now()), type: 'error', text: '保存异常' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('确定将该层记忆重置为系统默认配置吗？')) return;
    try {
      const success = await clearMemory(serverUrl, accessToken, activeTab);
      if (success) {
        setToast({ id: String(Date.now()), type: 'success', text: '已重置为默认记忆' });
        setEditing(false);
        await loadMemory();
      }
    } catch {
      setToast({ id: String(Date.now()), type: 'error', text: '重置失败' });
    }
  };

  const tabConfigs: Record<
    TabType,
    { title: string; subtitle: string; icon: any; color: string; bg: string; badge: string }
  > = {
    user_profile: {
      title: 'USER.md',
      subtitle: '用户画像与偏好',
      icon: User,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      badge: '常驻地/时间/席别习惯',
    },
    fact_lessons: {
      title: 'MEMORY.md',
      subtitle: '环境事实与经验避坑',
      icon: Bookmark,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      badge: '避坑事实/亲友关系',
    },
    soul: {
      title: 'SOUL.md',
      subtitle: '角色灵魂与准则',
      icon: Brain,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      badge: '沟通音色/严禁套话',
    },
  };

  const curTab = tabConfigs[activeTab];

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 select-none">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* 顶部导航 */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="p-1.5 -ml-1 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>AI 记忆系统</span>
              <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md">
                Hermes 三层架构
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">跨会话持久认知与自主反思学习</p>
          </div>
        </div>

        <button
          onClick={loadMemory}
          disabled={loading}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
          title="刷新记忆"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* 核心滚动区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Hermes 概念指引卡片 */}
        <div className="p-3.5 rounded-2xl bg-linear-to-br from-indigo-900 to-slate-900 text-white shadow-xs">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span className="text-xs font-bold tracking-wide">Hermes 冻结快照与自进化机制</span>
          </div>
          <p className="text-[11px] text-indigo-100/90 leading-relaxed">
            不同于金鱼记忆，系统将这三层文件在每次开局时作为固定上下文快照注入大模型。同时在对话中自主学习您的出行习惯，并在超限时自动压缩整合。
          </p>
        </div>

        {/* 三层选项卡切换 */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-200/80 rounded-2xl">
          {(['user_profile', 'fact_lessons', 'soul'] as TabType[]).map((t) => {
            const cfg = tabConfigs[t];
            const active = activeTab === t;
            const Icon = cfg.icon;
            return (
              <button
                key={t}
                onClick={() => {
                  setActiveTab(t);
                  setEditing(false);
                }}
                className={`flex flex-col items-center py-2 px-1 rounded-xl text-center transition-all cursor-pointer ${
                  active ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800 font-medium'
                }`}
              >
                <div className={`w-6 h-6 rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center mb-1`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs">{cfg.title}</span>
                <span className="text-[9px] text-slate-400 scale-90">{cfg.subtitle}</span>
              </button>
            );
          })}
        </div>

        {/* 记忆正文卡片 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-xl ${curTab.bg} ${curTab.color} flex items-center justify-center`}>
                <curTab.icon className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-bold text-slate-900">{curTab.title}</h2>
                  <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                    {curTab.badge}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">{curTab.subtitle}</span>
              </div>
            </div>

            {!editing ? (
              <button
                onClick={handleStartEdit}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>编辑</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
                  title="取消"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{saving ? '保存中...' : '保存'}</span>
                </button>
              </div>
            )}
          </div>

          {/* 正文展示 / 编辑框 */}
          {editing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={8}
              placeholder={`输入 ${curTab.title} 记忆内容...`}
              className="w-full text-xs font-mono bg-slate-50 border border-indigo-300 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-800 leading-relaxed resize-none"
            />
          ) : (
            <div className="text-xs text-slate-700 font-mono bg-slate-50/80 rounded-xl p-3.5 border border-slate-100 whitespace-pre-wrap leading-relaxed select-text">
              {getCurrentContent() || <span className="text-slate-400 italic">暂无记忆内容</span>}
            </div>
          )}

          {/* 底部操作与重置 */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>会话开局自动注入</span>
            </span>

            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>重置默认</span>
            </button>
          </div>
        </div>

        {/* 记忆运行机制说明 */}
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>三层记忆工作流说明</span>
          </div>
          <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc pl-4 leading-relaxed">
            <li>
              <strong className="text-slate-700">USER.md</strong>：保存您的常驻城市（如北京）、常订车票席别与出发时间习惯，换新会话无需重复交代。
            </li>
            <li>
              <strong className="text-slate-700">MEMORY.md</strong>：沉淀关键事实（如亲友姓名）与出行避坑经验（如安检排队耗时）。
            </li>
            <li>
              <strong className="text-slate-700">SOUL.md</strong>：全局规范助手的表达准则，保持极简直接，严禁机械重复的废话。
            </li>
            <li>
              <strong className="text-slate-700">自动学习</strong>：对话中包含“我以后想…”或决策时，大模型在后台静默提取并写入。
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
