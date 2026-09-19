import type { App } from 'vue';

import Antd from 'antdv-next';

import { ActionButton } from './button';

/**
 * 全局组件注册
 */
export function setupGlobalComponent(app: App) {
  app.use(Antd);
  // 表格操作列专用按钮
  app.component('ActionButton', ActionButton);
}

export { default as ApiSwitch } from './api-switch.vue';
