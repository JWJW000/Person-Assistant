<template>
  <div class="p-4 space-y-4">
    <!-- 顶部卡片：筛选与操作 -->
    <a-card title="💬 会话管理 (AI 对话会话与上下文审计)" :bordered="false">
      <!-- 搜索表单 -->
      <a-form layout="inline" class="mb-4 flex flex-wrap gap-2">
        <a-form-item label="会话标题">
          <a-input
            v-model:value="searchForm.title"
            placeholder="模糊搜索会话标题"
            allow-clear
            @pressEnter="handleSearch"
          />
        </a-form-item>
        <a-form-item label="用户ID">
          <a-input
            v-model:value="searchForm.userId"
            placeholder="输入用户ID精确过滤"
            allow-clear
            @pressEnter="handleSearch"
          />
        </a-form-item>
        <a-form-item label="状态">
          <a-select
            v-model:value="searchForm.status"
            placeholder="会话状态"
            class="w-32"
            allow-clear
          >
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="0">正常</a-select-option>
            <a-select-option value="1">已归档</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item>
          <a-space>
            <a-button type="primary" @click="handleSearch">
              查询
            </a-button>
            <a-button @click="handleReset">
              重置
            </a-button>
            <a-button @click="loadData">
              刷新
            </a-button>
          </a-space>
        </a-form-item>
      </a-form>

      <!-- 会话表格 -->
      <a-table
        :columns="columns"
        :data-source="sessionList"
        :loading="loading"
        row-key="id"
        :pagination="false"
        :scroll="{ x: 1200 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <div class="font-medium flex items-center gap-2">
              <span class="text-blue-500">💬</span>
              <span class="text-zinc-900 dark:text-zinc-100">{{ record.title || '无标题会话' }}</span>
              <a-tag v-if="record.isPinned === '1'" color="gold">置顶</a-tag>
            </div>
            <div class="text-xs text-zinc-400 mt-1 truncate max-w-sm">
              {{ record.lastMessagePreview || '暂无消息摘要' }}
            </div>
          </template>

          <template v-else-if="column.key === 'id'">
            <div class="flex items-center gap-1">
              <span class="font-mono text-xs text-zinc-500">{{ record.id }}</span>
              <a-button type="text" size="small" @click="copyText(record.id)" title="复制会话ID">
                📋
              </a-button>
            </div>
          </template>

          <template v-else-if="column.key === 'userId'">
            <a-tag color="cyan">{{ record.userId }}</a-tag>
          </template>

          <template v-else-if="column.key === 'messageCount'">
            <a-tag color="blue">
              {{ record.messageCount || 0 }} 条
            </a-tag>
          </template>

          <template v-else-if="column.key === 'status'">
            <a-tag :color="record.status === '0' ? 'success' : record.status === '1' ? 'warning' : 'error'">
              {{ record.status === '0' ? '正常' : record.status === '1' ? '已归档' : '已删除' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'updateTime'">
            <span class="text-xs text-zinc-500 font-mono">{{ formatTime(record.updateTime) }}</span>
          </template>

          <template v-else-if="column.key === 'createTime'">
            <span class="text-xs text-zinc-500 font-mono">{{ formatTime(record.createTime) }}</span>
          </template>

          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="openMessageDrawer(record)">
                查看记录
              </a-button>
              <a-popconfirm
                title="确定删除该会话？关联的消息记录将同步受影响！"
                ok-text="确认"
                cancel-text="取消"
                @confirm="handleDeleteSession(record.id)"
              >
                <a-button type="link" size="small" danger>
                  删除
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>

      <!-- 底部吸底固定分页栏 (Sticky Bottom Pagination) -->
      <div class="sticky bottom-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-4 py-3 border-t border-zinc-200/80 dark:border-zinc-800 flex justify-between items-center shadow-xs mt-3 -mx-6 -mb-6 rounded-b-xl">
        <div class="text-xs text-zinc-500">
          共 <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ pagination.total }}</span> 个会话，当前第 {{ pagination.current }} / {{ Math.ceil(pagination.total / pagination.pageSize) || 1 }} 页
        </div>
        <a-pagination
          v-model:current="pagination.current"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :show-size-changer="true"
          :show-quick-jumper="true"
          :page-size-options="['10', '20', '50']"
          size="small"
          @change="loadData"
        />
      </div>
    </a-card>

    <!-- 侧边抽屉：查看会话消息历史 -->
    <a-drawer
      v-model:open="drawerVisible"
      :title="`会话对话记录明细 - ${activeSession?.title || ''}`"
      width="780px"
    >
      <div class="space-y-4">
        <!-- 会话摘要条 -->
        <div class="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 space-y-1">
          <div class="flex justify-between items-center">
            <span class="font-mono">会话ID: {{ activeSession?.id }}</span>
            <a-button size="small" @click="loadMessages(activeSession?.id)">刷新对话</a-button>
          </div>
          <div class="flex gap-4">
            <span>用户ID: <span class="font-mono text-zinc-700 dark:text-zinc-300">{{ activeSession?.userId }}</span></span>
            <span>消息总计: <span class="font-semibold text-blue-600 dark:text-blue-400">{{ activeSession?.messageCount || messages.length }}</span> 条</span>
            <span>更新时间: {{ formatTime(activeSession?.updateTime) }}</span>
          </div>
        </div>

        <!-- 消息流展示 -->
        <div v-if="msgLoading" class="py-12 text-center text-zinc-400">
          加载中...
        </div>
        <div v-else-if="messages.length === 0" class="py-12 text-center text-zinc-400">
          <a-empty description="该会话尚无对话消息" />
        </div>
        <div v-else class="space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-2">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="p-3.5 rounded-lg border text-sm transition-all"
            :class="msg.role === 'user' 
              ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/80 dark:border-blue-900/50' 
              : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700'"
          >
            <!-- 头部元信息 -->
            <div class="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200/60 dark:border-zinc-700/60">
              <div class="flex items-center gap-2">
                <a-tag :color="msg.role === 'user' ? 'blue' : 'green'">
                  {{ msg.role === 'user' ? '👤 用户' : '🤖 AI 助手' }}
                </a-tag>
                <span v-if="msg.modelName" class="text-xs font-mono text-zinc-500 bg-zinc-200/50 dark:bg-zinc-700/50 px-1.5 py-0.5 rounded">
                  {{ msg.modelName }}
                </span>
                <span class="text-xs text-zinc-400">
                  {{ formatTime(msg.createTime) }}
                </span>
              </div>
              <div class="flex items-center gap-1">
                <a-button type="text" size="small" @click="copyText(msg.content)" title="复制文本">
                  复制
                </a-button>
                <a-popconfirm
                  title="确认删除该条消息记录？"
                  ok-text="删除"
                  cancel-text="取消"
                  @confirm="handleDeleteMessage(msg.id)"
                >
                  <a-button type="text" size="small" danger title="删除单条消息">
                    删除
                  </a-button>
                </a-popconfirm>
              </div>
            </div>

            <!-- 正文内容 -->
            <div class="whitespace-pre-wrap break-words leading-relaxed text-zinc-800 dark:text-zinc-200 font-sans select-text">
              {{ msg.content }}
            </div>

            <!-- AI 专属指标卡与引用明细 -->
            <div v-if="msg.role === 'assistant'" class="mt-3 pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-700/70 flex flex-wrap items-center justify-between text-xs text-zinc-400">
              <div class="flex gap-3">
                <span>Tokens: <span class="font-mono text-zinc-600 dark:text-zinc-300">{{ msg.totalTokens || ((msg.promptTokens || 0) + (msg.completionTokens || 0)) || 0 }}</span></span>
                <span v-if="msg.responseTimeMs">耗时: <span class="font-mono text-zinc-600 dark:text-zinc-300">{{ msg.responseTimeMs }}ms</span></span>
              </div>
              <div v-if="msg.citations && msg.citations.length" class="text-blue-500 font-medium">
                📚 检索知识库: 引用 {{ msg.citations.length }} 个片段
              </div>
            </div>
          </div>
        </div>
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { message as antdMessage } from 'antdv-next';
import {
  getSessionListApi,
  deleteSessionApi,
  getMessagesApi,
  deleteMessageApi,
  type AiChatSession,
  type AiChatMessage,
} from '#/api/ai/chat';

const message = {
  success: (msg: string) => {
    if (typeof window !== 'undefined' && (window as any).message?.success) {
      (window as any).message.success(msg);
    } else {
      try { antdMessage.success(msg); } catch { console.log('[success]', msg); }
    }
  },
  error: (msg: string) => {
    if (typeof window !== 'undefined' && (window as any).message?.error) {
      (window as any).message.error(msg);
    } else {
      try { antdMessage.error(msg); } catch { alert(msg); }
    }
  },
  warning: (msg: string) => {
    if (typeof window !== 'undefined' && (window as any).message?.warning) {
      (window as any).message.warning(msg);
    } else {
      try { antdMessage.warning(msg); } catch { alert(msg); }
    }
  },
};

const loading = ref(false);
const sessionList = ref<AiChatSession[]>([]);
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
});

const searchForm = reactive({
  title: '',
  userId: '',
  status: '',
});

const columns = [
  { title: '会话标题', key: 'title', dataIndex: 'title', width: 280 },
  { title: '会话ID', key: 'id', dataIndex: 'id', width: 190 },
  { title: '所属用户', key: 'userId', dataIndex: 'userId', width: 175 },
  { title: '消息数', key: 'messageCount', dataIndex: 'messageCount', width: 85 },
  { title: '状态', key: 'status', dataIndex: 'status', width: 80 },
  { title: '更新时间', key: 'updateTime', dataIndex: 'updateTime', width: 160 },
  { title: '创建时间', key: 'createTime', dataIndex: 'createTime', width: 160 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' },
];

// 抽屉状态
const drawerVisible = ref(false);
const activeSession = ref<AiChatSession | null>(null);
const messages = ref<AiChatMessage[]>([]);
const msgLoading = ref(false);

onMounted(() => {
  loadData();
});

async function loadData() {
  loading.value = true;
  try {
    const params: any = {
      pageNum: pagination.current,
      pageSize: pagination.pageSize,
    };
    if (searchForm.title) params.title = searchForm.title.trim();
    if (searchForm.userId) params.userId = searchForm.userId.trim();
    if (searchForm.status) params.status = searchForm.status;

    const res = await getSessionListApi(params);
    sessionList.value = res.rows || [];
    pagination.total = res.total || 0;
  } catch (err: any) {
    message.error(err?.message || '加载会话列表失败');
  } finally {
    loading.value = false;
  }
}

function formatTime(timeStr?: string) {
  if (!timeStr) return '-';
  return timeStr.replace('T', ' ').substring(0, 19);
}

function handleSearch() {
  pagination.current = 1;
  loadData();
}

function handleReset() {
  searchForm.title = '';
  searchForm.userId = '';
  searchForm.status = '';
  pagination.current = 1;
  loadData();
}

function handleTableChange(pag: any) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadData();
}

async function handleDeleteSession(id: string) {
  try {
    await deleteSessionApi(id);
    message.success('会话已删除');
    loadData();
  } catch (err: any) {
    message.error(err?.message || '删除会话失败');
  }
}

// 消息抽屉
function openMessageDrawer(record: AiChatSession) {
  activeSession.value = record;
  drawerVisible.value = true;
  loadMessages(record.id);
}

async function loadMessages(sessionId?: string) {
  if (!sessionId) return;
  msgLoading.value = true;
  try {
    const res = await getMessagesApi(sessionId);
    messages.value = res || [];
  } catch (err: any) {
    message.error(err?.message || '加载对话记录失败');
  } finally {
    msgLoading.value = false;
  }
}

async function handleDeleteMessage(id?: number) {
  if (!id) return;
  try {
    await deleteMessageApi(id);
    message.success('消息记录已删除');
    if (activeSession.value?.id) {
      loadMessages(activeSession.value.id);
    }
  } catch (err: any) {
    message.error(err?.message || '删除消息失败');
  }
}

function copyText(text?: string) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    message.success('已复制到剪贴板');
  }).catch(() => {
    message.error('复制失败');
  });
}
</script>
