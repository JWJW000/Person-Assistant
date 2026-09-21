/**
 * 全局按钮与可交互元素点击动效与触感增强
 * 包括：
 * 1. 强制激活 WebKit/Android WebView 的 :active 伪类状态
 * 2. 动态点按水波纹 (Touch Ripple Effect)
 * 3. 移动端原生微振动触觉反馈 (Haptic Feedback)
 */
export function initTactileEffects() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // 1. 激活移动端 WebKit 和 Android WebView 对 :active 伪类的触控响应
  document.addEventListener('touchstart', () => {}, { passive: true });

  // 2. 点按涟漪与微震动反馈
  document.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      // 忽略右键点击
      if (e.button !== 0) return;

      const target = (e.target as HTMLElement)?.closest(
        'button, [role="button"], a, .interactive-click, .ticket-card, input[type="submit"]'
      ) as HTMLElement | null;

      if (!target || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') {
        return;
      }

      // 物理微震动 (10ms 极轻触觉反馈)
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(10);
        } catch {}
      }

      // 水波纹动效
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const size = Math.max(rect.width, rect.height) * 1.2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      const ripple = document.createElement('span');
      ripple.className = 'touch-ripple-effect';
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;

      const compPos = window.getComputedStyle(target).position;
      if (compPos === 'static') {
        target.style.position = 'relative';
      }

      // 防止水波纹溢出按钮边界
      if (!target.classList.contains('overflow-visible') && !target.style.overflow) {
        target.style.overflow = 'hidden';
      }

      target.appendChild(ripple);

      const cleanup = () => {
        ripple.style.opacity = '0';
        setTimeout(() => {
          ripple.remove();
        }, 300);
      };

      target.addEventListener('pointerup', cleanup, { once: true });
      target.addEventListener('pointerleave', cleanup, { once: true });
      target.addEventListener('pointercancel', cleanup, { once: true });
      setTimeout(cleanup, 600);
    },
    { passive: true }
  );
}
