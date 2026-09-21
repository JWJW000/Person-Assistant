import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initTactileEffects } from './lib/ripple';
import './index.css';

// 核心初始化：激活全应用按钮点击弹性微动效、点按水波纹与原生微触觉反馈
initTactileEffects();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
