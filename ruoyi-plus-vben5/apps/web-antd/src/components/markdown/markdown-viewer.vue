<template>
  <div
    class="markdown-viewer-container relative select-text"
    :class="[
      bordered ? 'border border-zinc-200/80 dark:border-zinc-800 rounded-lg bg-zinc-50/40 dark:bg-zinc-900/40 p-3.5' : '',
      compact ? 'compact-mode' : '',
    ]"
  >
    <!-- 全文一键复制操作栏 -->
    <div
      v-if="copyable && content"
      class="absolute top-2.5 right-2.5 z-10"
    >
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-white/90 dark:bg-zinc-800/90 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 border border-zinc-200/80 dark:border-zinc-700 rounded-md shadow-2xs transition-colors cursor-pointer"
        @click="handleCopyAll"
      >
        <CheckOutlined v-if="copiedAll" class="text-emerald-500 text-[11px]" />
        <CopyOutlined v-else class="text-[11px]" />
        <span :class="copiedAll ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''">
          {{ copiedAll ? '已复制' : '复制全文' }}
        </span>
      </button>
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
import { CopyOutlined, CheckOutlined } from '@antdv-next/icons';
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
  emptyText: '暂无内容',
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
      return `<div class="code-card my-2.5 rounded-lg overflow-hidden border border-zinc-800 bg-[#0d1117] text-[#e6edf3] shadow-2xs">
  <div class="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-zinc-800 text-[11px] font-mono text-zinc-400 select-none">
    <span class="font-medium tracking-wide uppercase text-[10px] text-zinc-400">${displayLang}</span>
    <button type="button" class="code-copy-btn inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-700/60 transition-colors cursor-pointer" data-code="${encodedCode}">
      <span class="btn-text">复制</span>
    </button>
  </div>
  <pre class="m-0 p-3 overflow-x-auto text-[12px] font-mono leading-relaxed bg-[#0d1117] text-[#e6edf3]"><code>${highlighted}</code></pre>
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
    return `<div class="text-zinc-400 dark:text-zinc-500 text-xs py-2">${props.emptyText}</div>`;
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
    btn.classList.add('text-emerald-400');
    setTimeout(() => {
      textSpan.textContent = oldText;
      btn.classList.remove('text-emerald-400');
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
  line-height: 1.65;
  color: #3f3f46;
  word-break: break-word;
}

:deep(.dark) .markdown-body,
.dark .markdown-body {
  color: #d4d4d8;
}

/* 紧凑模式 */
.compact-mode .markdown-body {
  font-size: 0.75rem;
  line-height: 1.5;
}

:deep(.markdown-body h1) {
  font-size: 1.15rem;
  font-weight: 600;
  margin-top: 0.85rem;
  margin-bottom: 0.4rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #f1f5f9;
  color: #18181b;
}
:deep(.dark .markdown-body h1) {
  border-bottom-color: #27272a;
  color: #f4f4f5;
}

:deep(.markdown-body h2) {
  font-size: 1.05rem;
  font-weight: 600;
  margin-top: 0.75rem;
  margin-bottom: 0.35rem;
  padding-bottom: 0.2rem;
  border-bottom: 1px solid #f8fafc;
  color: #18181b;
}
:deep(.dark .markdown-body h2) {
  border-bottom-color: #27272a;
  color: #f4f4f5;
}

:deep(.markdown-body h3) {
  font-size: 0.925rem;
  font-weight: 600;
  margin-top: 0.65rem;
  margin-bottom: 0.25rem;
  color: #27272a;
}
:deep(.dark .markdown-body h3) {
  color: #e4e4e7;
}

:deep(.markdown-body h4),
:deep(.markdown-body h5),
:deep(.markdown-body h6) {
  font-size: 0.825rem;
  font-weight: 600;
  margin-top: 0.5rem;
  margin-bottom: 0.2rem;
  color: #27272a;
}
:deep(.dark .markdown-body h4),
:deep(.dark .markdown-body h5),
:deep(.dark .markdown-body h6) {
  color: #e4e4e7;
}

:deep(.markdown-body p) {
  margin-top: 0.35rem;
  margin-bottom: 0.35rem;
}

:deep(.markdown-body ul) {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin-top: 0.35rem;
  margin-bottom: 0.35rem;
}

:deep(.markdown-body ol) {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin-top: 0.35rem;
  margin-bottom: 0.35rem;
}

:deep(.markdown-body li) {
  margin-top: 0.15rem;
  margin-bottom: 0.15rem;
}

:deep(.markdown-body blockquote) {
  border-left: 3px solid #cbd5e1;
  background-color: #f8fafc;
  padding: 0.35rem 0.75rem;
  margin: 0.5rem 0;
  border-radius: 0 0.375rem 0.375rem 0;
  color: #64748b;
  font-style: normal;
}
:deep(.dark .markdown-body blockquote) {
  border-left-color: #3f3f46;
  background-color: #18181b;
  color: #94a3b8;
}

:deep(.markdown-body table) {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 0.65rem 0;
  font-size: 0.775rem;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}
:deep(.dark .markdown-body table) {
  border-color: #27272a;
}

:deep(.markdown-body th) {
  background-color: #f8fafc;
  padding: 0.45rem 0.75rem;
  font-weight: 600;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  color: #475569;
}
:deep(.dark .markdown-body th) {
  background-color: #18181b;
  border-bottom-color: #27272a;
  color: #cbd5e1;
}

:deep(.markdown-body td) {
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}
:deep(.dark .markdown-body td) {
  border-bottom-color: #27272a;
  color: #94a3b8;
}

:deep(.markdown-body tr:last-child td) {
  border-bottom: none;
}

:deep(.markdown-body tr:hover td) {
  background-color: #f8fafc;
}
:deep(.dark .markdown-body tr:hover td) {
  background-color: #27272a;
}

:deep(.markdown-body code:not(pre code)) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85em;
  background-color: #f1f5f9;
  color: #0f172a;
  padding: 0.125rem 0.35rem;
  border-radius: 0.25rem;
  border: 1px solid #e2e8f0;
  font-weight: 500;
}
:deep(.dark .markdown-body code:not(pre code)) {
  background-color: #27272a;
  color: #f1f5f9;
  border-color: #3f3f46;
}

:deep(.markdown-body hr) {
  margin: 0.75rem 0;
  border: none;
  border-top: 1px solid #e2e8f0;
}
:deep(.dark .markdown-body hr) {
  border-top-color: #27272a;
}

/* GitHub Dark Theme 语法高亮配色 */
:deep(.hljs-keyword),
:deep(.hljs-selector-tag),
:deep(.hljs-subst) {
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
  color: #a5d6ff;
}

:deep(.hljs-comment),
:deep(.hljs-quote),
:deep(.hljs-deletion) {
  color: #8b949e;
  font-style: italic;
}

:deep(.hljs-number),
:deep(.hljs-regexp),
:deep(.hljs-link) {
  color: #79c0ff;
}

:deep(.hljs-built_in),
:deep(.hljs-class .hljs-title) {
  color: #ffa657;
}

:deep(.hljs-variable) {
  color: #d2a8ff;
}
</style>
