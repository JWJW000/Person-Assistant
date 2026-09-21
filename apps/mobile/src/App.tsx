import React, { useState, useEffect } from 'react';
import { useAppStore } from './store';
import { LoginPage } from './pages/LoginPage';
import { PairingPage } from './pages/PairingPage';
import { ChatPage } from './pages/ChatPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { SettingsPage } from './pages/SettingsPage';
import { MemoryPage } from './pages/MemoryPage';
import { UpdateBanner } from './components/UpdateBanner';

export const App: React.FC = () => {
  const { accessToken } = useAppStore();
  const [authMode, setAuthMode] = useState<'login' | 'pair'>('login');
  const [activeOverlay, setActiveOverlay] = useState<'none' | 'knowledge' | 'settings' | 'memory'>('none');
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  // 所有 Hook 必须严格声明在组件顶部，绝不可放在任何条件返回之后（避免 React "Rendered fewer hooks" 白屏崩溃）
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
        window.scrollTo(0, 0);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
      handleResize();
      return () => {
        window.visualViewport?.removeEventListener('resize', handleResize);
        window.visualViewport?.removeEventListener('scroll', handleResize);
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
      style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}
      className="fixed inset-x-0 top-0 flex flex-col overflow-hidden bg-white text-slate-900 antialiased selection:bg-slate-900 selection:text-white"
    >
      <UpdateBanner />

      {/* 主视图区：ChatGPT 全沉浸式架构 */}
      <main className="flex-1 min-h-0 overflow-hidden relative">
        <ChatPage
          onOpenKnowledge={() => setActiveOverlay('knowledge')}
          onOpenMemory={() => setActiveOverlay('memory')}
          onOpenSettings={() => setActiveOverlay('settings')}
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
      </main>
    </div>
  );
};
