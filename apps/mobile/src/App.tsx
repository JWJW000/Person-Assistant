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
  // 软键盘：只改 CSS 变量，不触发 React 重渲染。rAF 合并多次 resize/scroll，避免键盘动画中的高度频闪。
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let rafId = 0;
    const apply = () => {
      rafId = 0;
      document.documentElement.style.setProperty('--app-height', `${vv.height}px`);
      document.documentElement.style.setProperty('--app-offset-top', `${vv.offsetTop}px`);
      window.scrollTo(0, 0);
    };
    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(apply);
    };

    apply();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    return () => {
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      if (rafId) cancelAnimationFrame(rafId);
    };
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
      style={{ height: 'var(--app-height, 100dvh)', top: 'var(--app-offset-top, 0px)' }}
      className="fixed inset-x-0 flex flex-col overflow-hidden bg-white text-slate-900 antialiased selection:bg-slate-900 selection:text-white"
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
