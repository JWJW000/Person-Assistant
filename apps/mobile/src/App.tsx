import React, { useState } from 'react';
import { useAppStore } from './store';
import { PairingPage } from './pages/PairingPage';
import { ChatPage } from './pages/ChatPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { SettingsPage } from './pages/SettingsPage';
import { MessageSquare, Bookmark, Settings } from 'lucide-react';
import { UpdateBanner } from './components/UpdateBanner';

export const App: React.FC = () => {
  const { deviceToken } = useAppStore();
  const [paired, setPaired] = useState(!!deviceToken);
  const [activeTab, setActiveTab] = useState<'chat' | 'favorites' | 'settings'>('chat');

  if (!paired) {
    return <PairingPage onPaired={() => setPaired(true)} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
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
          <span className="text-[10px] font-medium">智能查票</span>
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
