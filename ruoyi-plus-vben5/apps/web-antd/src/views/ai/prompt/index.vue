<template>
  <div class="p-4 space-y-4">
    <!-- 顶部卡片：提示词筛选与全局操作 -->
    <a-card title="✨ 提示词管理 (System Prompt 指令模板与角色预设)" :bordered="false">
      <template #extra>
        <a-space>
          <a-button type="primary" @click="openCreateModal">
            + 新建提示词
          </a-button>
          <a-button @click="loadData">
            刷新
          </a-button>
        </a-space>
      </template>

      <!-- 搜索表单 -->
      <a-form layout="inline" class="mb-4 flex flex-wrap gap-2">
        <a-form-item label="提示词标题">
          <a-input
            v-model:value="searchForm.title"
            placeholder="模糊搜索标题名称"
            allow-clear
            @pressEnter="handleSearch"
          />
        </a-form-item>
        <a-form-item label="分类">
          <a-select
            v-model:value="searchForm.category"
            placeholder="所属分类"
            class="w-36"
            allow-clear
          >
            <a-select-option value="">全部分类</a-select-option>
            <a-select-option value="出行助手">出行助手</a-select-option>
            <a-select-option value="编程开发">编程开发</a-select-option>
            <a-select-option value="知识助理">知识助理</a-select-option>
            <a-select-option value="语言翻译">语言翻译</a-select-option>
            <a-select-option value="数据分析">数据分析</a-select-option>
            <a-select-option value="文案创作">文案创作</a-select-option>
            <a-select-option value="通用">通用</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="状态">
          <a-select
            v-model:value="searchForm.status"
            placeholder="状态"
            class="w-28"
            allow-clear
          >
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="0">正常</a-select-option>
            <a-select-option value="1">停用</a-select-option>
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
          </a-space>
        </a-form-item>
      </a-form>

      <!-- 提示词表格 -->
      <a-table
        :columns="columns"
        :data-source="promptList"
        :loading="loading"
        row-key="id"
        :pagination="pagination"
        :scroll="{ x: 1200 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <div class="font-medium flex items-center gap-2">
              <span class="text-amber-500">✨</span>
              <span class="text-zinc-900 dark:text-zinc-100">{{ record.title }}</span>
              <a-tag v-if="record.isSystem === '1'" color="gold">内置</a-tag>
            </div>
            <div v-if="record.act" class="text-xs text-zinc-400 font-mono mt-0.5">
              角色标识: {{ record.act }}
            </div>
          </template>

          <template v-else-if="column.key === 'category'">
            <a-tag :color="getCategoryColor(record.category)">
              {{ record.category || '通用' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'content'">
            <div
              class="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-2 cursor-pointer hover:text-blue-500 transition-colors"
              @click="openViewModal(record)"
              :title="record.content"
            >
              {{ record.content }}
            </div>
          </template>

          <template v-else-if="column.key === 'status'">
            <a-tag :color="record.status === '0' ? 'success' : 'error'">
              {{ record.status === '0' ? '正常' : '停用' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'sortOrder'">
            <span class="font-mono text-xs">{{ record.sortOrder ?? 0 }}</span>
          </template>

          <template v-else-if="column.key === 'updateTime'">
            <span class="font-mono text-xs text-zinc-500">{{ formatTime(record.updateTime) }}</span>
          </template>

          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="openViewModal(record)">
                查看
              </a-button>
              <a-button type="link" size="small" @click="openEditModal(record)">
                编辑
              </a-button>
              <a-popconfirm
                title="确定删除该提示词模板？"
                ok-text="删除"
                cancel-text="取消"
                @confirm="handleDelete(record.id)"
              >
                <a-button type="link" size="small" danger>
                  删除
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新增 / 编辑提示词弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="editingId ? '编辑提示词模板' : '新增提示词模板'"
      width="650px"
      ok-text="保存"
      cancel-text="取消"
      @ok="handleSave"
      :confirm-loading="saving"
    >
      <a-form layout="vertical" :model="formData">
        <div class="grid grid-cols-2 gap-4">
          <a-form-item label="提示词名称 / 标题" required>
            <a-input v-model:value="formData.title" placeholder="例如：12306 出行专家、全栈工程师" />
          </a-form-item>
          <a-form-item label="角色代号 (Act)">
            <a-input v-model:value="formData.act" placeholder="例如：travel_expert、coder" />
          </a-form-item>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <a-form-item label="分类" required>
            <a-select v-model:value="formData.category">
              <a-select-option value="出行助手">出行助手</a-select-option>
              <a-select-option value="编程开发">编程开发</a-select-option>
              <a-select-option value="知识助理">知识助理</a-select-option>
              <a-select-option value="语言翻译">语言翻译</a-select-option>
              <a-select-option value="数据分析">数据分析</a-select-option>
              <a-select-option value="文案创作">文案创作</a-select-option>
              <a-select-option value="通用">通用</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="排序权重">
            <a-input-number v-model:value="formData.sortOrder" :min="0" :max="999" class="w-full" />
          </a-form-item>
        </div>

        <a-form-item label="提示词正文 (System Prompt / 指令模板)" required>
          <a-textarea
            v-model:value="formData.content"
            placeholder="输入针对大模型的系统级角色定位、输出风格约束与核心业务规则..."
            :rows="6"
          />
        </a-form-item>

        <div class="grid grid-cols-2 gap-4">
          <a-form-item label="是否内置">
            <a-radio-group v-model:value="formData.isSystem">
              <a-radio value="0">自定义</a-radio>
              <a-radio value="1">系统预设</a-radio>
            </a-radio-group>
          </a-form-item>
          <a-form-item label="状态">
            <a-radio-group v-model:value="formData.status">
              <a-radio value="0">启用</a-radio>
              <a-radio value="1">停用</a-radio>
            </a-radio-group>
          </a-form-item>
        </div>

        <a-form-item label="备注说明">
          <a-input v-model:value="formData.remark" placeholder="使用场景说明或适用模型建议" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 查看提示词明细弹窗 -->
    <a-modal
      v-model:open="viewModalVisible"
      :title="`提示词详情 - ${activePrompt?.title || ''}`"
      width="680px"
      :footer="null"
    >
      <div v-if="activePrompt" class="space-y-4 py-2">
        <div class="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
          <div class="flex items-center gap-2">
            <a-tag :color="getCategoryColor(activePrompt.category)">{{ activePrompt.category }}</a-tag>
            <span v-if="activePrompt.act" class="font-mono text-zinc-500">标识: {{ activePrompt.act }}</span>
          </div>
          <a-button size="small" @click="copyText(activePrompt.content)">一键复制内容</a-button>
        </div>

        <div>
          <div class="text-xs text-zinc-400 mb-1">提示词正文：</div>
          <div class="p-4 rounded-lg bg-zinc-100/70 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm whitespace-pre-wrap break-words max-h-96 overflow-y-auto font-sans leading-relaxed select-text">
            {{ activePrompt.content }}
          </div>
        </div>

        <div v-if="activePrompt.remark" class="text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-800/40 p-2.5 rounded border border-zinc-200 dark:border-zinc-700">
          备注: {{ activePrompt.remark }}
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { message as antdMessage } from 'antdv-next';
import {
  getPromptListApi,
  createPromptApi,
  updatePromptApi,
  deletePromptApi,
  type AiPrompt,
} from '#/api/ai/prompt';

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
const promptList = ref<AiPrompt[]>([]);
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
});

const searchForm = reactive({
  title: '',
  category: '',
  status: '',
});

const columns = [
  { title: '提示词标题', key: 'title', dataIndex: 'title', width: 260 },
  { title: '分类', key: 'category', dataIndex: 'category', width: 110 },
  { title: '指令正文摘要', key: 'content', dataIndex: 'content' },
  { title: '状态', key: 'status', dataIndex: 'status', width: 85 },
  { title: '排序', key: 'sortOrder', dataIndex: 'sortOrder', width: 75 },
  { title: '更新时间', key: 'updateTime', dataIndex: 'updateTime', width: 160 },
  { title: '操作', key: 'action', width: 160, fixed: 'right' },
];

const modalVisible = ref(false);
const viewModalVisible = ref(false);
const activePrompt = ref<AiPrompt | null>(null);
const editingId = ref<number | null>(null);
const saving = ref(false);

const formData = reactive<AiPrompt>({
  title: '',
  act: '',
  content: '',
  category: '通用',
  sortOrder: 0,
  isSystem: '0',
  status: '0',
  remark: '',
});

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
    if (searchForm.category) params.category = searchForm.category;
    if (searchForm.status) params.status = searchForm.status;

    const res = await getPromptListApi(params);
    promptList.value = res.rows || [];
    pagination.total = res.total || 0;
  } catch (err: any) {
    message.error(err?.message || '加载提示词列表失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.current = 1;
  loadData();
}

function handleReset() {
  searchForm.title = '';
  searchForm.category = '';
  searchForm.status = '';
  pagination.current = 1;
  loadData();
}

function handleTableChange(pag: any) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadData();
}

function getCategoryColor(category?: string) {
  switch (category) {
    case '出行助手':
      return 'cyan';
    case '编程开发':
      return 'blue';
    case '知识助理':
      return 'purple';
    case '语言翻译':
      return 'green';
    case '数据分析':
      return 'orange';
    case '文案创作':
      return 'pink';
    default:
      return 'default';
  }
}

function formatTime(timeStr?: string) {
  if (!timeStr) return '-';
  return timeStr.replace('T', ' ').substring(0, 19);
}

function openCreateModal() {
  editingId.value = null;
  formData.title = '';
  formData.act = '';
  formData.content = '';
  formData.category = '通用';
  formData.sortOrder = 0;
  formData.isSystem = '0';
  formData.status = '0';
  formData.remark = '';
  modalVisible.value = true;
}

function openEditModal(record: AiPrompt) {
  editingId.value = record.id || null;
  formData.title = record.title;
  formData.act = record.act || '';
  formData.content = record.content;
  formData.category = record.category || '通用';
  formData.sortOrder = record.sortOrder ?? 0;
  formData.isSystem = record.isSystem || '0';
  formData.status = record.status || '0';
  formData.remark = record.remark || '';
  modalVisible.value = true;
}

function openViewModal(record: AiPrompt) {
  activePrompt.value = record;
  viewModalVisible.value = true;
}

async function handleSave() {
  if (!formData.title || !formData.title.trim()) {
    message.warning('请输入提示词标题');
    return;
  }
  if (!formData.content || !formData.content.trim()) {
    message.warning('请输入提示词正文');
    return;
  }

  saving.value = true;
  try {
    if (editingId.value) {
      await updatePromptApi({ ...formData, id: editingId.value });
      message.success('提示词更新成功');
    } else {
      await createPromptApi(formData);
      message.success('提示词创建成功');
    }
    modalVisible.value = false;
    loadData();
  } catch (err: any) {
    message.error(err?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function handleDelete(id?: number) {
  if (!id) return;
  try {
    await deletePromptApi(id);
    message.success('提示词删除成功');
    loadData();
  } catch (err: any) {
    message.error(err?.message || '删除失败');
  }
}

function copyText(text?: string) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    message.success('提示词已复制到剪贴板');
  }).catch(() => {
    message.error('复制失败');
  });
}
</script>
