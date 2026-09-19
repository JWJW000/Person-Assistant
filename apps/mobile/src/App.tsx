import React, { useState } from 'react';
import { useAppStore } from './store';
import { LoginPage } from './pages/LoginPage';
import { PairingPage } from './pages/PairingPage';
import { ChatPage } from './pages/ChatPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { SettingsPage } from './pages/SettingsPage';
import { MessageSquare, Bookmark, Settings } from 'lucide-react';
import { UpdateBanner } from './components/UpdateBanner';

export const App: React.FC = () => {
  const { accessToken, deviceToken } = useAppStore();
  const [authMode, setAuthMode] = useState<'login' | 'pair'>('login');
  const [activeTab, setActiveTab] = useState<'chat' | 'favorites' | 'settings'>('chat');

  const isAuthenticated = Boolean(accessToken || deviceToken);

  if (!isAuthenticated) {
    if (authMode === 'pair') {
      return (
        <div className="relative">
          <PairingPage onPaired={() => {}} />
          <div className="fixed bottom-6 left-0 right-0 text-center z-30">
            <button
              onClick={() => setAuthMode('login')}
              className="text-xs text-blue-600 font-medium bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm border border-slate-200"
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
    <div className="flex flex-col h-screen overflow-hidden bg-[#F2F2F7]">
      <UpdateBanner />
      {/* 视图切换 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <ChatPage />}
        {activeTab === 'favorites' && <FavoritesPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </div>

      {/* iOS 原生底栏导航 TabBar */}
      <div className="safe-bottom bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-6 py-2 flex justify-around items-center z-20">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            activeTab === 'chat' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px] font-medium">智能问答</span>
        </button>

        <button
          onClick={() => setActiveTab('favorites')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            activeTab === 'favorites' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          <Bookmark className="w-5 h-5" />
          <span className="text-[10px] font-medium">我的收藏</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            activeTab === 'settings' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-medium">系统设置</span>
        </button>
      </div>
    </div>
  );
};
