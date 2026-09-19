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
  const { accessToken, deviceToken } = useAppStore();
  const [authMode, setAuthMode] = useState<'login' | 'pair'>('login');
  const [activeTab, setActiveTab] = useState<'chat' | 'knowledge' | 'settings'>('chat');

  const isAuthenticated = Boolean(accessToken || deviceToken);

  if (!isAuthenticated) {
    if (authMode === 'pair') {
      return (
        <div className="relative">
          <PairingPage onPaired={() => {}} />
          <div className="fixed bottom-6 left-0 right-0 text-center z-30">
            <button
              onClick={() => setAuthMode('login')}
              className="text-xs text-[#757575] hover:text-[#151515] font-medium bg-white px-4 py-2 rounded-lg border border-[#EDEDED] shadow-xs"
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
    <div className="flex flex-col h-screen overflow-hidden bg-white text-[#151515] antialiased">
      <UpdateBanner />

      {/* 主视图区 */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'chat' && <ChatPage />}
        {activeTab === 'knowledge' && <KnowledgePage />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* 极简底栏导航 (ui-skills standard tabbar) */}
      <nav className="safe-bottom bg-white border-t border-[#EDEDED] px-4 py-2 flex justify-around items-center z-20">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'chat'
              ? 'text-[#151515] font-medium'
              : 'text-[#A5A5A5] hover:text-[#757575]'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[11px]">智能对话</span>
        </button>

        <button
          onClick={() => setActiveTab('knowledge')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'knowledge'
              ? 'text-[#151515] font-medium'
              : 'text-[#A5A5A5] hover:text-[#757575]'
          }`}
        >
          <Database className="w-5 h-5" />
          <span className="text-[11px]">知识库管理</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'settings'
              ? 'text-[#151515] font-medium'
              : 'text-[#A5A5A5] hover:text-[#757575]'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[11px]">系统设置</span>
        </button>
      </nav>
    </div>
  );
};
