<template>
  <div
    class="markdown-viewer-container relative select-text"
    :class="[
      bordered ? 'border border-zinc-200/80 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 p-3.5' : '',
      compact ? 'compact-mode' : '',
    ]"
  >
    <!-- 全文一键复制操作栏 -->
    <div
      v-if="copyable && content"
      class="absolute top-2 right-2 z-10 opacity-70 hover:opacity-100 transition-opacity"
    >
      <a-button
        size="small"
        type="text"
        class="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-xs border border-zinc-200/80 dark:border-zinc-700/80 rounded-md px-2 py-0.5 shadow-2xs"
        @click="handleCopyAll"
      >
        <span v-if="copiedAll" class="text-emerald-600 dark:text-emerald-400 font-medium">✓ 已复制</span>
        <span v-else>📋 复制全文</span>
      </a-button>
    </div>

    <!-- 渲染主体 -->
    <div
      class="markdown-body overflow-y-auto"
      :style="scrollStyle"
      v-html="renderedHtml"
      @click="handleContainerClick"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Marked } from 'marked';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

interface Props {
  content?: string;
  maxHeight?: string | number;
  bordered?: boolean;
  compact?: boolean;
  copyable?: boolean;
  emptyText?: string;
}
const props = withDefaults(defineProps<Props>(), {
  content: '',
  maxHeight: undefined,
  bordered: false,
  compact: false,
  copyable: false,
  emptyText: '（暂无内容）',
});

const copiedAll = ref(false);

const scrollStyle = computed(() => {
  if (!props.maxHeight || props.maxHeight === 'none') {
    return {};
  }
  const heightVal = typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight;
  return {
    maxHeight: heightVal,
  };
});

// 构建 Marked 实例
const markedInstance = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    link({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr} class="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 transition-colors">${text}</a>`;
    },
    code({ text, lang }) {
      const cleanLang = (lang || '').trim().toLowerCase();
      const hasLang = cleanLang && hljs.getLanguage(cleanLang);
      let highlighted = '';
      try {
        highlighted = hasLang
          ? hljs.highlight(text, { language: cleanLang, ignoreIllegals: true }).value
          : hljs.highlightAuto(text).value;
      } catch {
        highlighted = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      const displayLang = cleanLang || 'text';
      const encodedCode = encodeURIComponent(text);
      return `<div class="code-block-card my-2.5 rounded-lg overflow-hidden border border-zinc-200/80 dark:border-zinc-800 bg-[#f8f9fa] dark:bg-[#181825] shadow-2xs">
  <div class="code-block-header flex items-center justify-between px-3 py-1 bg-zinc-100/90 dark:bg-[#11111b] border-b border-zinc-200/80 dark:border-zinc-800 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 select-none">
    <span class="font-semibold uppercase tracking-wider">${displayLang}</span>
    <button type="button" class="code-copy-btn flex items-center gap-1 px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer" data-code="${encodedCode}">
      <span class="btn-text">复制</span>
    </button>
  </div>
  <pre class="m-0 p-3 overflow-x-auto text-xs font-mono leading-relaxed bg-[#f8f9fa] dark:bg-[#181825]"><code>${highlighted}</code></pre>
</div>`;
    },
  },
});

function sanitizeHtml(dirty: string): string {
  if (typeof window !== 'undefined') {
    const purifier = typeof DOMPurify.sanitize === 'function' ? DOMPurify : (DOMPurify as any)(window);
    return purifier.sanitize(dirty, {
      ADD_ATTR: ['target', 'rel', 'data-code', 'class'],
      ADD_TAGS: ['button', 'span', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    });
  }
  return dirty;
}

const renderedHtml = computed(() => {
  const text = (props.content || '').trim();
  if (!text) {
    return `<div class="text-zinc-400 dark:text-zinc-500 italic text-xs py-2">${props.emptyText}</div>`;
  }
  try {
    const parsed = markedInstance.parse(text) as string;
    return sanitizeHtml(parsed);
  } catch (err) {
    console.error('Markdown parse error:', err);
    return `<pre class="whitespace-pre-wrap font-mono text-xs text-red-500">${text}</pre>`;
  }
});

// 处理代码块内的复制按钮事件委托
function handleContainerClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  const btn = target.closest('.code-copy-btn') as HTMLButtonElement | null;
  if (!btn) return;

  event.preventDefault();
  event.stopPropagation();

  const encoded = btn.getAttribute('data-code');
  if (!encoded) return;

  const rawCode = decodeURIComponent(encoded);
  copyToClipboard(rawCode);

  const textSpan = btn.querySelector('.btn-text');
  if (textSpan) {
    const oldText = textSpan.textContent;
    textSpan.textContent = '已复制 ✓';
    btn.classList.add('text-emerald-600', 'dark:text-emerald-400');
    setTimeout(() => {
      textSpan.textContent = oldText;
      btn.classList.remove('text-emerald-600', 'dark:text-emerald-400');
    }, 2000);
  }
}

// 复制全文
function handleCopyAll() {
  if (!props.content) return;
  copyToClipboard(props.content);
  copiedAll.value = true;
  setTimeout(() => {
    copiedAll.value = false;
  }, 2000);
}

function copyToClipboard(text: string) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (e) {
    console.warn('Copy failed:', e);
  }
}
</script>

<style scoped>
.markdown-body {
  font-size: 0.8125rem;
  line-height: 1.6;
  color: #27272a;
  word-break: break-word;
}

:deep(.dark) .markdown-body,
.dark .markdown-body {
  color: #e4e4e7;
}

/* 紧凑模式 */
.compact-mode .markdown-body {
  font-size: 0.75rem;
  line-height: 1.5;
}

:deep(.markdown-body h1) {
  font-size: 1.25rem;
  font-weight: 700;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid rgba(228, 228, 231, 0.8);
  color: #18181b;
}
:deep(.dark .markdown-body h1) {
  border-bottom-color: rgba(63, 63, 70, 0.8);
  color: #f4f4f5;
}

:deep(.markdown-body h2) {
  font-size: 1.1rem;
  font-weight: 700;
  margin-top: 0.75rem;
  margin-bottom: 0.375rem;
  padding-bottom: 0.2rem;
  border-bottom: 1px solid rgba(244, 244, 245, 0.9);
  color: #18181b;
}
:deep(.dark .markdown-body h2) {
  border-bottom-color: rgba(39, 39, 42, 0.9);
  color: #f4f4f5;
}

:deep(.markdown-body h3) {
  font-size: 0.95rem;
  font-weight: 600;
  margin-top: 0.625rem;
  margin-bottom: 0.25rem;
  color: #27272a;
}
:deep(.dark .markdown-body h3) {
  color: #e4e4e7;
}

:deep(.markdown-body h4),
:deep(.markdown-body h5),
:deep(.markdown-body h6) {
  font-size: 0.85rem;
  font-weight: 600;
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
  color: #27272a;
}
:deep(.dark .markdown-body h4),
:deep(.dark .markdown-body h5),
:deep(.dark .markdown-body h6) {
  color: #e4e4e7;
}

:deep(.markdown-body p) {
  margin-top: 0.375rem;
  margin-bottom: 0.375rem;
}

:deep(.markdown-body ul) {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin-top: 0.375rem;
  margin-bottom: 0.375rem;
}

:deep(.markdown-body ol) {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin-top: 0.375rem;
  margin-bottom: 0.375rem;
}

:deep(.markdown-body li) {
  margin-top: 0.15rem;
  margin-bottom: 0.15rem;
}

:deep(.markdown-body blockquote) {
  border-left: 3.5px solid #3b82f6;
  background-color: rgba(239, 246, 255, 0.6);
  padding: 0.375rem 0.75rem;
  margin: 0.5rem 0;
  border-radius: 0 0.375rem 0.375rem 0;
  font-style: italic;
  color: #4b5563;
}
:deep(.dark .markdown-body blockquote) {
  background-color: rgba(30, 58, 138, 0.2);
  border-left-color: #60a5fa;
  color: #d1d5db;
}

:deep(.markdown-body table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.625rem 0;
  font-size: 0.8125rem;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid rgba(228, 228, 231, 0.8);
}
:deep(.dark .markdown-body table) {
  border-color: rgba(63, 63, 70, 0.8);
}

:deep(.markdown-body th) {
  background-color: rgba(244, 244, 245, 0.95);
  padding: 0.4rem 0.625rem;
  font-weight: 600;
  border-bottom: 1px solid rgba(228, 228, 231, 0.8);
  text-align: left;
  color: #3f3f46;
}
:deep(.dark .markdown-body th) {
  background-color: rgba(39, 39, 42, 0.9);
  border-bottom-color: rgba(63, 63, 70, 0.8);
  color: #d4d4d8;
}

:deep(.markdown-body td) {
  padding: 0.375rem 0.625rem;
  border-bottom: 1px solid rgba(244, 244, 245, 0.8);
  color: #52525b;
}
:deep(.dark .markdown-body td) {
  border-bottom-color: rgba(39, 39, 42, 0.6);
  color: #a1a1aa;
}

:deep(.markdown-body tr:hover td) {
  background-color: rgba(244, 244, 245, 0.5);
}
:deep(.dark .markdown-body tr:hover td) {
  background-color: rgba(39, 39, 42, 0.4);
}

:deep(.markdown-body code:not(pre code)) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85em;
  background-color: rgba(244, 244, 245, 0.9);
  color: #db2777;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(228, 228, 231, 0.8);
}
:deep(.dark .markdown-body code:not(pre code)) {
  background-color: rgba(39, 39, 42, 0.9);
  color: #f472b6;
  border-color: rgba(63, 63, 70, 0.8);
}

:deep(.markdown-body hr) {
  margin: 0.75rem 0;
  border: none;
  border-top: 1px solid rgba(228, 228, 231, 0.8);
}
:deep(.dark .markdown-body hr) {
  border-top-color: rgba(63, 63, 70, 0.8);
}

/* 代码高亮关键字色彩 */
:deep(.hljs-keyword),
:deep(.hljs-selector-tag),
:deep(.hljs-subst) {
  color: #cf222e;
  font-weight: 600;
}
:deep(.dark .hljs-keyword),
:deep(.dark .hljs-selector-tag),
:deep(.dark .hljs-subst) {
  color: #ff7b72;
}

:deep(.hljs-string),
:deep(.hljs-title),
:deep(.hljs-section),
:deep(.hljs-attribute),
:deep(.hljs-literal),
:deep(.hljs-template-tag),
:deep(.hljs-template-variable),
:deep(.hljs-type),
:deep(.hljs-addition) {
  color: #0a3069;
}
:deep(.dark .hljs-string),
:deep(.dark .hljs-title),
:deep(.dark .hljs-section),
:deep(.dark .hljs-attribute),
:deep(.dark .hljs-literal),
:deep(.dark .hljs-template-tag),
:deep(.dark .hljs-template-variable),
:deep(.dark .hljs-type),
:deep(.dark .hljs-addition) {
  color: #a5d6ff;
}

:deep(.hljs-comment),
:deep(.hljs-quote),
:deep(.hljs-deletion) {
  color: #6e7781;
  font-style: italic;
}
:deep(.dark .hljs-comment),
:deep(.dark .hljs-quote),
:deep(.dark .hljs-deletion) {
  color: #8b949e;
}

:deep(.hljs-number),
:deep(.hljs-regexp),
:deep(.hljs-link) {
  color: #0550ae;
}
:deep(.dark .hljs-number),
:deep(.dark .hljs-regexp),
:deep(.dark .hljs-link) {
  color: #79c0ff;
}

:deep(.hljs-built_in),
:deep(.hljs-class .hljs-title) {
  color: #953800;
}
:deep(.dark .hljs-built_in),
:deep(.dark .hljs-class .hljs-title) {
  color: #ffa657;
}

:deep(.hljs-variable) {
  color: #953800;
}
:deep(.dark .hljs-variable) {
  color: #d2a8ff;
}
</style>
