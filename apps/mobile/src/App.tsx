import React, { useState } from 'react';
import { useAppStore } from './store';
import { LoginPage } from './pages/LoginPage';
import { PairingPage } from './pages/PairingPage';
import { ChatPage } from './pages/ChatPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { SettingsPage } from './pages/SettingsPage';
import { MessageSquare, Database, Settings } from 'lucide-react';
import { UpdateBanner } from './components/UpdateBanner';

export const App: React.FC = () => {
  const { accessToken } = useAppStore();
  const [authMode, setAuthMode] = useState<'login' | 'pair'>('login');
  const [activeTab, setActiveTab] = useState<'chat' | 'knowledge' | 'settings'>('chat');

  // 严格要求：进入应用前必须先完成系统账号登录
  const isAuthenticated = Boolean(accessToken);

  if (!isAuthenticated) {
    if (authMode === 'pair') {
      return (
        <div className="relative">
          <PairingPage onPaired={() => {}} />
          <div className="fixed bottom-6 left-0 right-0 text-center z-30">
            <button
              onClick={() => setAuthMode('login')}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-xs active:scale-95 transition-all"
            >
              返回账号密码登录 &rarr;
            </button>
          </div>
        </div>
      );
    }
    return (
      <LoginPage
        onLoginSuccess={() => {}}
        onSwitchToPairing={() => setAuthMode('pair')}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#F8FAFC] text-slate-900 antialiased selection:bg-slate-900 selection:text-white">
      <UpdateBanner />

      {/* 主视图区 */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'chat' && <ChatPage />}
        {activeTab === 'knowledge' && <KnowledgePage />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* 现代悬浮胶囊底栏 (Floating Island Dock) */}
      <div className="fixed bottom-4 inset-x-0 flex justify-center items-center pointer-events-none z-30 safe-bottom">
        <nav className="pointer-events-auto bg-white/90 backdrop-blur-2xl border border-slate-200/90 shadow-[0_12px_40px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.04)] p-1.5 rounded-2xl flex items-center gap-1 ring-1 ring-slate-900/[0.04] transition-all">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-slate-900 text-white shadow-xs scale-[1.02]'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 active:scale-95'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>智能问答</span>
          </button>

          <button
            onClick={() => setActiveTab('knowledge')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
              activeTab === 'knowledge'
                ? 'bg-slate-900 text-white shadow-xs scale-[1.02]'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 active:scale-95'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>知识库管理</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-slate-900 text-white shadow-xs scale-[1.02]'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 active:scale-95'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>系统设置</span>
          </button>
        </nav>
      </div>
    </div>
  );
};
