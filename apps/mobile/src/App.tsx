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

      {/* 主视图区 (Tab 内存保活架构：切换 Tab 仅切换 display 状态，绝不销毁重载组件) */}
      <main className="flex-1 overflow-hidden relative">
        <div className={`h-full w-full ${activeTab === 'chat' ? 'block' : 'hidden'}`}>
          <ChatPage />
        </div>
        <div className={`h-full w-full ${activeTab === 'knowledge' ? 'block' : 'hidden'}`}>
          <KnowledgePage />
        </div>
        <div className={`h-full w-full ${activeTab === 'settings' ? 'block' : 'hidden'}`}>
          <SettingsPage />
        </div>
      </main>

      {/* 固定在屏幕底部的标准移动端底栏 (Fixed at Bottom with safe-bottom) */}
      <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl border-t border-slate-200 z-30 safe-bottom">
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-4">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors cursor-pointer ${
              activeTab === 'chat'
                ? 'text-slate-900 font-semibold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="text-[11px]">智能问答</span>
          </button>

          <button
            onClick={() => setActiveTab('knowledge')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors cursor-pointer ${
              activeTab === 'knowledge'
                ? 'text-slate-900 font-semibold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Database className="w-4 h-4" />
            <span className="text-[11px]">知识库管理</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'text-slate-900 font-semibold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="text-[11px]">系统设置</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
