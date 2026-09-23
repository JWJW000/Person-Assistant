import React, { useState, useEffect } from 'react';
import { useAppStore } from './store';
import { LoginPage } from './pages/LoginPage';
import { PairingPage } from './pages/PairingPage';
import { ChatPage } from './pages/ChatPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { SettingsPage } from './pages/SettingsPage';
import { MemoryPage } from './pages/MemoryPage';
import { PiTasksPage } from './pages/PiTasksPage';
import { UpdateBanner } from './components/UpdateBanner';

export const App: React.FC = () => {
  const { accessToken } = useAppStore();
  const piRemoteEnabled = import.meta.env.VITE_PI_REMOTE_ENABLED === 'true';
  const [authMode, setAuthMode] = useState<'login' | 'pair'>('login');
  const [activeOverlay, setActiveOverlay] = useState<'none' | 'knowledge' | 'settings' | 'memory' | 'pi'>('none');
  // 视口与软键盘弹性适配：利用 CSS 变量直接在合成器层更新，绝不在键盘弹起时高频触发 React 根组件重渲染
  useEffect(() => {
    const syncViewport = () => {
      if (window.visualViewport) {
        document.documentElement.style.setProperty('--app-height', `${window.visualViewport.height}px`);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewport);
      syncViewport();
      return () => {
        window.visualViewport?.removeEventListener('resize', syncViewport);
      };
    }
  }, []);

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
    <div
      style={{ height: 'var(--app-height, 100dvh)' }}
      className="fixed inset-x-0 top-0 flex flex-col overflow-hidden bg-white text-slate-900 antialiased selection:bg-slate-900 selection:text-white"
    >
      <UpdateBanner />

      {/* 主视图区：ChatGPT 全沉浸式架构 */}
      <main className="flex-1 min-h-0 overflow-hidden relative">
        <ChatPage
          onOpenKnowledge={() => setActiveOverlay('knowledge')}
          onOpenMemory={() => setActiveOverlay('memory')}
          onOpenSettings={() => setActiveOverlay('settings')}
          onOpenPi={piRemoteEnabled ? () => setActiveOverlay('pi') : undefined}
        />

        {/* 知识库管理滑动层 */}
        {activeOverlay === 'knowledge' && (
          <div className="absolute inset-0 z-40 bg-white animate-in slide-in-from-right duration-200">
            <KnowledgePage onBack={() => setActiveOverlay('none')} />
          </div>
        )}

        {/* Hermes 三层记忆系统滑动层 */}
        {activeOverlay === 'memory' && (
          <div className="absolute inset-0 z-40 bg-white animate-in slide-in-from-right duration-200">
            <MemoryPage onBack={() => setActiveOverlay('none')} />
          </div>
        )}

        {/* 系统设置滑动层 */}
        {activeOverlay === 'settings' && (
          <div className="absolute inset-0 z-40 bg-white animate-in slide-in-from-right duration-200">
            <SettingsPage onBack={() => setActiveOverlay('none')} />
          </div>
        )}

        {activeOverlay === 'pi' && (
          <div className="absolute inset-0 z-40 bg-white animate-in slide-in-from-right duration-200">
            <PiTasksPage onBack={() => setActiveOverlay('none')} />
          </div>
        )}
      </main>
    </div>
  );
};
