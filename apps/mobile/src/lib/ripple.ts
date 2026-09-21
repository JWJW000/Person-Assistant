/**
 * 全局触感与微动效引擎 (Zero-Lag Tactile Engine)
 * 1. 激活移动端 WebKit 和 Android WebView 对 :active 伪类的触控响应
 * 2. 硬件级轻触微震动 (Haptic Feedback, 10ms 零布局开销，不阻塞主线程)
 */
export function initTactileEffects() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // 1. 激活移动端 WebKit 和 Android WebView 对 :active 伪类的触控响应
  document.addEventListener('touchstart', () => {}, { passive: true });

  // 2. 触觉物理反馈 (轻量微震动，避免任何 DOM 计算阻塞)
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

      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(10);
        } catch {}
      }
    },
    { passive: true }
  );
}
