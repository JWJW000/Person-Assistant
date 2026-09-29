<template>
  <div class="flex h-full w-full bg-white dark:bg-zinc-900 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
    <!-- 左侧会话列表 -->
    <div class="w-64 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <div class="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <a-button type="primary" block @click="handleCreateSession">
          + 新建对话
        </a-button>
      </div>

      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        <div
          v-for="item in sessions"
          :key="item.id"
          class="group flex items-center justify-between p-2.5 rounded-lg cursor-pointer text-sm transition-colors"
          :class="currentSessionId === item.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'"
          @click="selectSession(item.id)"
        >
          <div class="truncate flex-1 pr-2">
            {{ item.title || '新对话' }}
          </div>
          <a-popconfirm title="确定删除该会话？" @confirm.stop="handleDeleteSession(item.id)">
            <span class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity">✕</span>
          </a-popconfirm>
        </div>
      </div>
    </div>

    <!-- 右侧聊天主体 -->
    <div class="flex-1 flex flex-col h-full bg-white dark:bg-zinc-900">
      <!-- 顶部信息栏 -->
      <div class="h-14 border-b border-zinc-200 dark:border-zinc-800 px-4 flex items-center justify-between">
        <div class="font-medium text-base text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
          <span>🤖 AI 智能助手与企业知识中台</span>
          <span class="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
            pgvector 知识库在线
          </span>
        </div>
      </div>

      <!-- 消息滚动列表 -->
      <div ref="chatContainerRef" class="flex-1 overflow-y-auto p-4 space-y-4">
        <div
          v-for="(msg, index) in messages"
          :key="index"
          class="flex"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-2xl px-4 py-3 rounded-2xl text-sm leading-relaxed break-words"
            :class="msg.role === 'user'
              ? 'bg-primary text-white rounded-br-none shadow-sm whitespace-pre-wrap'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-bl-none shadow-sm border border-zinc-200/50 dark:border-zinc-700/50'"
          >
            <template v-if="msg.role === 'user'">
              {{ msg.content }}
            </template>
            <MarkdownViewer v-else :content="msg.content" />
          </div>
        </div>

        <div v-if="loading" class="flex justify-start">
          <div class="max-w-2xl px-4 py-3 rounded-2xl rounded-bl-none text-sm leading-relaxed break-words bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border border-zinc-200/50 dark:border-zinc-700/50 shadow-sm">
            <div v-if="!currentStreamingText" class="flex flex-col gap-2 py-1 text-xs text-zinc-400">
              <div class="flex items-center gap-2">
                <span class="inline-block w-2 h-2 rounded-full bg-primary animate-ping" />
                <span>{{ currentStatusText || (currentThinkingText ? '正在深度思考推理中...' : '正在深度思考并组织回答...') }}</span>
              </div>
              <div v-if="currentThinkingText" class="pl-2 border-l-2 border-zinc-300 dark:border-zinc-700 font-mono text-[11px] text-zinc-500 whitespace-pre-wrap max-h-32 overflow-y-auto">
                {{ currentThinkingText }}
              </div>
            </div>
            <div v-else>
              <details v-if="currentThinkingText" class="mb-2 rounded-lg bg-zinc-200/50 dark:bg-zinc-700/50 p-2 text-xs text-zinc-500">
                <summary class="cursor-pointer font-medium hover:text-zinc-700 dark:hover:text-zinc-300 select-none">
                  💭 思考过程 (思考完成)
                </summary>
                <div class="mt-1 pt-1 border-t border-zinc-300 dark:border-zinc-700 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {{ currentThinkingText }}
                </div>
              </details>
              <MarkdownViewer :content="currentStreamingText" />
            </div>
          </div>
        </div>
      </div>

      <!-- 底部输入栏 -->
      <div class="p-4 border-t border-zinc-200 dark:border-zinc-800">
        <div class="flex gap-2">
          <a-textarea
            v-model:value="inputMessage"
            placeholder="输入您的问题，Shift + Enter 换行，Enter 直接发送..."
            :auto-size="{ minRows: 2, maxRows: 5 }"
            @keydown.enter.prevent="handleEnterPress"
          />
          <a-button type="primary" :loading="loading" class="h-auto px-6" @click="handleSendMessage">
            发送
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useAppConfig } from '@vben/hooks';
import { useAccessStore } from '@vben/stores';
import { MarkdownViewer } from '#/components/markdown';
import { getSessionsApi, createSessionApi, deleteSessionApi, getMessagesApi } from '#/api/ai/chat';

interface SessionItem {
  id: string;
  title: string;
  lastMessagePreview?: string;
}

interface MessageItem {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const showToast = (type: 'success' | 'warning' | 'error', text: string) => {
  if (typeof window !== 'undefined' && (window as any).message) {
    (window as any).message[type](text);
  } else {
    console.log(`[${type}]`, text);
  }
};

const sessions = ref<SessionItem[]>([]);
const currentSessionId = ref<string>('');
const messages = ref<MessageItem[]>([]);
const inputMessage = ref<string>('');
const loading = ref<boolean>(false);
const currentStreamingText = ref<string>('');
const currentThinkingText = ref<string>('');
const currentStatusText = ref<string>('');
const chatContainerRef = ref<HTMLElement | null>(null);
const abortController = ref<AbortController | null>(null);
const { apiURL, clientId } = useAppConfig(import.meta.env, import.meta.env.PROD);
const accessStore = useAccessStore();

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainerRef.value) {
      chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight;
    }
  });
};

const loadSessions = async () => {
  try {
    const res = await getSessionsApi();
    sessions.value = (res as any) || [];
    if (sessions.value.length > 0 && !currentSessionId.value) {
      selectSession(sessions.value[0]!.id);
    }
  } catch (err: any) {
    showToast('error', '加载会话列表失败');
  }
};

const selectSession = async (id: string) => {
  currentSessionId.value = id;
  try {
    const res = await getMessagesApi(id);
    messages.value = (res as any) || [];
    scrollToBottom();
  } catch (err: any) {
    showToast('error', '加载会话详情失败');
  }
};

const handleCreateSession = async () => {
  try {
    const newSession = await createSessionApi({ title: '新对话' });
    if (newSession && (newSession as any).id) {
      await loadSessions();
      selectSession((newSession as any).id);
    }
  } catch (err: any) {
    showToast('error', '创建新对话失败');
  }
};

const handleDeleteSession = async (id: string) => {
  try {
    await deleteSessionApi(id);
    showToast('success', '会话已删除');
    if (currentSessionId.value === id) {
      currentSessionId.value = '';
      messages.value = [];
    }
    await loadSessions();
  } catch (err: any) {
    showToast('error', '删除会话失败');
  }
};

const handleEnterPress = (e: KeyboardEvent) => {
  if (e.shiftKey) {
    inputMessage.value += '\n';
  } else {
    handleSendMessage();
  }
};

const handleSendMessage = async () => {
  const text = inputMessage.value.trim();
  if (!text) return;
  if (!currentSessionId.value) {
    await handleCreateSession();
  }
  if (!currentSessionId.value) {
    showToast('warning', '请先选择或创建对话');
    return;
  }

  messages.value.push({ role: 'user', content: text });
  inputMessage.value = '';
  loading.value = true;
  currentStreamingText.value = '';
  currentThinkingText.value = '';
  currentStatusText.value = '';
  scrollToBottom();

  const controller = new AbortController();
  abortController.value = controller;

  try {
    const url = `${apiURL}/ai/chat/stream`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        clientid: clientId,
        Authorization: `Bearer ${accessStore.accessToken || ''}`,
      },
      body: JSON.stringify({
        sessionId: currentSessionId.value,
        message: text,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`服务响应异常 (${res.status}): ${errText}`);
    }

    if (!res.body) {
      throw new Error('当前环境不支持流式响应');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let currentEvent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const cleanLine = line.endsWith('\r') ? line.slice(0, -1) : line;

        if (cleanLine.startsWith(':')) continue;

        if (cleanLine === '') {
          currentEvent = '';
          continue;
        }

        if (cleanLine.startsWith('event:')) {
          currentEvent = cleanLine.slice(6).trim();
          continue;
        }

        if (cleanLine.startsWith('data:')) {
          const rawData = cleanLine.startsWith('data: ') ? cleanLine.slice(6) : cleanLine.slice(5);

          if (rawData === '[DONE]' || currentEvent === 'done') {
            break;
          }
          if (currentEvent === 'thinking') {
            currentThinkingText.value += rawData;
          } else if (currentEvent === 'status') {
            currentStatusText.value = rawData;
          } else if (currentEvent === 'error') {
            throw new Error(rawData || '模型生成失败');
          } else {
            currentStreamingText.value += rawData;
            scrollToBottom();
          }
        }
      }
    }

    if (currentStreamingText.value || currentThinkingText.value) {
      messages.value.push({
        role: 'assistant',
        content: currentStreamingText.value || currentThinkingText.value,
      });
    }
    currentStreamingText.value = '';
    currentThinkingText.value = '';
    currentStatusText.value = '';
    loading.value = false;
    scrollToBottom();
    loadSessions();
  } catch (err: any) {
    if (controller.signal.aborted) {
      return;
    }
    loading.value = false;
    if (currentStreamingText.value) {
      messages.value.push({ role: 'assistant', content: currentStreamingText.value });
    } else {
      messages.value.push({
        role: 'assistant',
        content: `（生成中断: ${err?.message || '网络连接异常'}）`,
      });
    }
    currentStreamingText.value = '';
    currentThinkingText.value = '';
    currentStatusText.value = '';
    showToast('error', err?.message || '流式连接异常');
    scrollToBottom();
  }
};
onMounted(() => {
  loadSessions();
});
</script>
