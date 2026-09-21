/**
 * 全局触感与微动效引擎 (Native Haptic & Tactile Engine)
 * 1. 激活移动端 WebKit 和 Android WebView 对 :active 伪类的触控响应
 * 2. 双重原生级物理触感反馈 (Native AndroidBridge + navigator.vibrate)
 */
export function triggerHaptic(durationMs = 25) {
  if (typeof window === 'undefined') return;

  // 1. 优先调用我们注入的 Android 原生 HapticBridge (触发系统物理按键振动电机或 VIRTUAL_KEY)
  const win = window as any;
  if (win.AndroidBridge) {
    try {
      win.AndroidBridge.click();
      return;
    } catch {}
    try {
      win.AndroidBridge.vibrate(durationMs);
      return;
    } catch {}
  }

  // 2. 兜底调用标准 WebKit / Chromium navigator.vibrate
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(durationMs);
    } catch {}
  }
}

export function initTactileEffects() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // 激活移动端 WebKit 和 Android WebView 对 :active 伪类的触控响应
  document.addEventListener('touchstart', () => {}, { passive: true });

  // 绑定全局点击与按压物理触感
  document.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      if (e.button !== 0) return;

      const target = (e.target as HTMLElement)?.closest(
        'button, [role="button"], a, .interactive-click, .ticket-card, input[type="submit"]'
      ) as HTMLElement | null;

      if (!target || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') {
        return;
      }

      triggerHaptic(20);
    },
    { passive: true }
  );
}
