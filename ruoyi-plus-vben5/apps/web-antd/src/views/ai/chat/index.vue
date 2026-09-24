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

        <div v-if="loading && currentStreamingText" class="flex justify-start">
          <div class="max-w-2xl px-4 py-3 rounded-2xl rounded-bl-none text-sm leading-relaxed break-words bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border border-zinc-200/50 dark:border-zinc-700/50 shadow-sm animate-pulse">
            <MarkdownViewer :content="currentStreamingText" />
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
const chatContainerRef = ref<HTMLElement | null>(null);

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
  scrollToBottom();

  try {
    const url = `/api/ai/chat/stream?sessionId=${encodeURIComponent(currentSessionId.value)}&message=${encodeURIComponent(text)}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      const chunk = event.data;
      currentStreamingText.value += chunk;
      scrollToBottom();
    };

    eventSource.addEventListener('done', () => {
      messages.value.push({ role: 'assistant', content: currentStreamingText.value });
      currentStreamingText.value = '';
      loading.value = false;
      eventSource.close();
      scrollToBottom();
      loadSessions();
    });

    eventSource.addEventListener('error', () => {
      if (currentStreamingText.value) {
        messages.value.push({ role: 'assistant', content: currentStreamingText.value });
      }
      currentStreamingText.value = '';
      loading.value = false;
      eventSource.close();
      scrollToBottom();
    });
  } catch (err) {
    loading.value = false;
    showToast('error', '流式通道连接异常');
  }
};

onMounted(() => {
  loadSessions();
});
</script>
