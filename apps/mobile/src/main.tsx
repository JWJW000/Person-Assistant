import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initTactileEffects } from './lib/ripple';
import './index.css';

// 核心初始化：激活全应用按钮点击弹性微动效、点按水波纹与原生微触觉反馈
initTactileEffects();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="应用遇到未预期异常">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
