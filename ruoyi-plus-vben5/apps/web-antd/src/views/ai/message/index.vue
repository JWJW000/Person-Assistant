<template>
  <div class="p-4 space-y-4">
    <!-- 顶部卡片：筛选与操作 -->
    <a-card title="📜 消息管理 (AI 全平台问答消息审计与记录)" :bordered="false">
      <!-- 搜索表单 -->
      <a-form layout="inline" class="mb-4 flex flex-wrap gap-2">
        <a-form-item label="会话ID">
          <a-input
            v-model:value="searchForm.sessionId"
            placeholder="会话ID (精准/模糊)"
            allow-clear
            @pressEnter="handleSearch"
          />
        </a-form-item>
        <a-form-item label="消息内容">
          <a-input
            v-model:value="searchForm.content"
            placeholder="搜索提问或AI回答关键字"
            allow-clear
            @pressEnter="handleSearch"
          />
        </a-form-item>
        <a-form-item label="角色">
          <a-select
            v-model:value="searchForm.role"
            placeholder="角色类型"
            class="w-32"
            allow-clear
          >
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="user">👤 用户</a-select-option>
            <a-select-option value="assistant">🤖 AI助手</a-select-option>
            <a-select-option value="system">⚙️ 系统</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="模型名称">
          <a-input
            v-model:value="searchForm.modelName"
            placeholder="如 deepseek-chat"
            allow-clear
            @pressEnter="handleSearch"
          />
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

      <!-- 消息表格 -->
      <a-table
        :columns="columns"
        :data-source="messageList"
        :loading="loading"
        row-key="id"
        :pagination="false"
        :scroll="{ x: 1300 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'id'">
            <span class="font-mono text-xs text-zinc-500">#{{ record.id }}</span>
          </template>

          <template v-else-if="column.key === 'sessionId'">
            <div class="flex items-center gap-1">
              <span class="font-mono text-xs text-zinc-500 truncate max-w-[130px]" :title="record.sessionId">
                {{ record.sessionId }}
              </span>
              <a-button type="text" size="small" @click="copyText(record.sessionId)" title="复制会话ID">
                📋
              </a-button>
            </div>
          </template>

          <template v-else-if="column.key === 'role'">
            <a-tag :color="record.role === 'user' ? 'blue' : record.role === 'assistant' ? 'green' : 'orange'">
              {{ record.role === 'user' ? '👤 用户' : record.role === 'assistant' ? '🤖 AI助手' : record.role }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'content'">
            <div
              class="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-2 cursor-pointer hover:text-blue-500 transition-colors"
              @click="openDetailModal(record)"
              :title="record.content"
            >
              {{ record.content }}
            </div>
          </template>

          <template v-else-if="column.key === 'modelName'">
            <span v-if="record.modelName" class="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
              {{ record.modelName }}
            </span>
            <span v-else class="text-zinc-400 text-xs">-</span>
          </template>

          <template v-else-if="column.key === 'tokens'">
            <div class="text-xs font-mono">
              <span class="font-semibold text-zinc-800 dark:text-zinc-200">
                {{ record.totalTokens || ((record.promptTokens || 0) + (record.completionTokens || 0)) || 0 }}
              </span>
              <span class="text-zinc-400 text-[10px] block">
                ({{ record.promptTokens || 0 }} / {{ record.completionTokens || 0 }})
              </span>
            </div>
          </template>

          <template v-else-if="column.key === 'responseTimeMs'">
            <span v-if="record.responseTimeMs" class="text-xs font-mono text-zinc-600 dark:text-zinc-300">
              {{ record.responseTimeMs }}ms
            </span>
            <span v-else class="text-zinc-400 text-xs">-</span>
          </template>

          <template v-else-if="column.key === 'status'">
            <a-tag :color="record.status === 'success' || record.status === '0' ? 'success' : 'error'">
              {{ record.status === 'success' || record.status === '0' ? '成功' : '失败' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'createTime'">
            <span class="text-xs text-zinc-500 font-mono">{{ formatTime(record.createTime) }}</span>
          </template>

          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="openDetailModal(record)">
                明细
              </a-button>
              <a-popconfirm
                title="确定删除此条消息审计记录？"
                ok-text="删除"
                cancel-text="取消"
                @confirm="handleDeleteMessage(record.id)"
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
          共 <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ pagination.total }}</span> 条消息记录，当前第 {{ pagination.current }} / {{ Math.ceil(pagination.total / pagination.pageSize) || 1 }} 页
        </div>
        <a-pagination
          v-model:current="pagination.current"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :show-size-changer="true"
          :show-quick-jumper="true"
          :page-size-options="['10', '20', '50', '100']"
          size="small"
          @change="loadData"
        />
      </div>
    </a-card>

    <!-- 弹窗：查看单条消息审计详情 -->
    <a-modal
      v-model:open="modalVisible"
      :title="`消息审计详情 #${activeMessage?.id || ''}`"
      width="720px"
      :footer="null"
    >
      <div v-if="activeMessage" class="space-y-4 py-2">
        <!-- 元数据统计网格 -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
          <div>
            <div class="text-zinc-400 mb-0.5">消息角色</div>
            <a-tag :color="activeMessage.role === 'user' ? 'blue' : 'green'">
              {{ activeMessage.role === 'user' ? '👤 用户' : '🤖 AI助手' }}
            </a-tag>
          </div>
          <div>
            <div class="text-zinc-400 mb-0.5">调用模型</div>
            <div class="font-mono text-zinc-700 dark:text-zinc-300 truncate">{{ activeMessage.modelName || '未记录' }}</div>
          </div>
          <div>
            <div class="text-zinc-400 mb-0.5">耗时</div>
            <div class="font-mono text-zinc-700 dark:text-zinc-300">{{ activeMessage.responseTimeMs ? `${activeMessage.responseTimeMs}ms` : '-' }}</div>
          </div>
          <div>
            <div class="text-zinc-400 mb-0.5">消耗 Tokens</div>
            <div class="font-mono text-zinc-700 dark:text-zinc-300">
              {{ activeMessage.totalTokens || ((activeMessage.promptTokens || 0) + (activeMessage.completionTokens || 0)) || 0 }}
            </div>
          </div>
        </div>

        <!-- 详细信息条 -->
        <div class="text-xs text-zinc-500 space-y-1 bg-zinc-50/60 dark:bg-zinc-800/40 p-2.5 rounded border border-zinc-200 dark:border-zinc-700">
          <div class="flex items-center justify-between">
            <span class="font-mono">所属会话: {{ activeMessage.sessionId }}</span>
            <a-button type="link" size="small" @click="copyText(activeMessage.sessionId)">复制会话ID</a-button>
          </div>
          <div class="flex gap-4">
            <span>用户ID: <span class="font-mono">{{ activeMessage.userId }}</span></span>
            <span>记录时间: {{ formatTime(activeMessage.createTime) }}</span>
            <span>状态: {{ activeMessage.status }}</span>
          </div>
        </div>

        <!-- 异常报错 -->
        <div v-if="activeMessage.errorMsg" class="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-600 dark:text-red-400">
          <div class="font-semibold mb-1">❌ 错误异常信息：</div>
          <div class="font-mono whitespace-pre-wrap">{{ activeMessage.errorMsg }}</div>
        </div>

        <!-- 消息正文文本 -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <div class="text-sm font-medium text-zinc-800 dark:text-zinc-200">消息正文：</div>
            <a-button size="small" @click="copyText(activeMessage.content)">一键复制内容</a-button>
          </div>
          <div class="bg-zinc-100/70 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm whitespace-pre-wrap break-words max-h-96 overflow-y-auto font-sans leading-relaxed select-text">
            {{ activeMessage.content }}
          </div>
        </div>

        <!-- 知识库切片引用展示 -->
        <div v-if="activeMessage.citations && activeMessage.citations.length" class="space-y-2">
          <div class="text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <span>📚 检索命中的知识库引用 (共 {{ activeMessage.citations.length }} 条)</span>
          </div>
          <div class="space-y-2 max-h-48 overflow-y-auto">
            <div
              v-for="(cit, idx) in activeMessage.citations"
              :key="idx"
              class="p-2.5 bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 rounded text-xs"
            >
              <div class="flex items-center justify-between mb-1 text-zinc-500 font-medium">
                <span>片段 #{{ Number(idx) + 1 }} {{ cit.title ? `· ${cit.title}` : '' }}</span>
                <span v-if="cit.score" class="font-mono text-blue-600">相似度: {{ (cit.score * 100).toFixed(1) }}%</span>
              </div>
              <div class="text-zinc-700 dark:text-zinc-300 line-clamp-3">
                {{ cit.content || cit.snippet || JSON.stringify(cit) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { message as antdMessage } from 'antdv-next';
import {
  getMessageListApi,
  deleteMessageApi,
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
const messageList = ref<AiChatMessage[]>([]);
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
});

const searchForm = reactive({
  sessionId: '',
  content: '',
  role: '',
  modelName: '',
});

const columns = [
  { title: 'ID', key: 'id', dataIndex: 'id', width: 65 },
  { title: '会话ID', key: 'sessionId', dataIndex: 'sessionId', width: 160 },
  { title: '角色', key: 'role', dataIndex: 'role', width: 95 },
  { title: '消息内容摘要', key: 'content', dataIndex: 'content' },
  { title: '模型名称', key: 'modelName', dataIndex: 'modelName', width: 150 },
  { title: 'Tokens (总/提/答)', key: 'tokens', width: 130 },
  { title: '耗时', key: 'responseTimeMs', dataIndex: 'responseTimeMs', width: 85 },
  { title: '状态', key: 'status', dataIndex: 'status', width: 75 },
  { title: '记录时间', key: 'createTime', dataIndex: 'createTime', width: 160 },
  { title: '操作', key: 'action', width: 110, fixed: 'right' },
];

const modalVisible = ref(false);
const activeMessage = ref<AiChatMessage | null>(null);

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
    if (searchForm.sessionId) params.sessionId = searchForm.sessionId.trim();
    if (searchForm.content) params.content = searchForm.content.trim();
    if (searchForm.role) params.role = searchForm.role;
    if (searchForm.modelName) params.modelName = searchForm.modelName.trim();

    const res = await getMessageListApi(params);
    messageList.value = res.rows || [];
    pagination.total = res.total || 0;
  } catch (err: any) {
    message.error(err?.message || '加载消息记录失败');
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
  searchForm.sessionId = '';
  searchForm.content = '';
  searchForm.role = '';
  searchForm.modelName = '';
  pagination.current = 1;
  loadData();
}

function handleTableChange(pag: any) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadData();
}

function openDetailModal(record: AiChatMessage) {
  activeMessage.value = record;
  modalVisible.value = true;
}

async function handleDeleteMessage(id?: number) {
  if (!id) return;
  try {
    await deleteMessageApi(id);
    message.success('已删除该条消息审计记录');
    loadData();
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
