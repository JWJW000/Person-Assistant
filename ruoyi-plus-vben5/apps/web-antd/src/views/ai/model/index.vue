<template>
  <div class="h-[calc(100vh-90px)] flex flex-col overflow-hidden p-4 select-none">
    <a-card
      title="⚙️ AI 大模型与向量模型配置 (OpenAI 协议兼容)"
      :bordered="false"
      class="flex-1 min-h-0 flex flex-col overflow-hidden shadow-xs rounded-xl"
      :body-style="{ flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column', padding: '16px 16px 0 16px', overflow: 'hidden' }"
    >
      <template #extra>
        <a-space>
          <a-button type="primary" @click="openCreateModal">
            + 添加模型配置
          </a-button>
          <a-button @click="loadData">
            刷新
          </a-button>
        </a-space>
      </template>

      <!-- 模型表格内部滚动区 (列表内滑动) -->
      <div class="flex-1 min-h-0 overflow-hidden">
      <a-table
        :columns="columns"
        :data-source="modelList"
        :loading="loading"
        row-key="id"
        :pagination="false"
        :scroll="{ y: 'calc(100vh - 275px)', x: 1000 }"
        class="internal-table"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="font-medium flex items-center gap-2">
              <span>{{ record.name }}</span>
              <a-tag v-if="record.isDefault === '1'" color="gold">默认</a-tag>
            </div>
            <div class="text-xs text-zinc-400 font-mono">{{ record.modelName }}</div>
          </template>

          <template v-else-if="column.key === 'provider'">
            <a-tag :color="getProviderColor(record.provider)">
              {{ record.provider?.toUpperCase() }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'modelType'">
            <a-tag :color="record.modelType === 'chat' ? 'blue' : record.modelType === 'embedding' ? 'purple' : 'cyan'">
              {{ record.modelType === 'chat' ? '💬 对话' : record.modelType === 'embedding' ? '📐 向量嵌入' : record.modelType }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'baseUrl'">
            <span class="text-xs font-mono text-zinc-500 truncate max-w-xs block">
              {{ record.baseUrl }}
            </span>
          </template>

          <template v-else-if="column.key === 'status'">
            <a-tag :color="record.status === '0' ? 'success' : 'error'">
              {{ record.status === '0' ? '正常' : '停用' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button
                v-if="record.isDefault !== '1'"
                type="link"
                size="small"
                @click="handleSetDefault(record.id)"
              >
                设为默认
              </a-button>
              <a-button type="link" size="small" @click="openEditModal(record)">
                编辑
              </a-button>
              <a-popconfirm title="确定删除该模型配置？" @confirm="handleDelete(record.id)">
                <a-button type="link" size="small" danger>
                  删除
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
      </div>

      <!-- 底部吸底固定分页栏 (Sticky Bottom Pagination) -->
      <div class="sticky bottom-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-4 py-3 border-t border-zinc-200/80 dark:border-zinc-800 flex justify-between items-center shadow-xs mt-0 -mx-4 rounded-b-xl z-10">
        <div class="text-xs text-zinc-500">
          共 <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ pagination.total }}</span> 个模型配置，当前第 {{ pagination.current }} / {{ Math.ceil(pagination.total / pagination.pageSize) || 1 }} 页
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

    <!-- 新建 / 编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="editingId ? '编辑模型配置' : '新增模型配置'"
      width="600px"
      :z-index="1100"
      ok-text="保存配置"
      cancel-text="取消"
      @ok="handleSave"
      :confirm-loading="saving"
    >
      <a-form layout="vertical" :model="formData">
        <div class="grid grid-cols-2 gap-4">
          <a-form-item label="配置别名" required>
            <a-input v-model:value="formData.name" placeholder="例如：DeepSeek 官方直连" />
          </a-form-item>
          <a-form-item label="供应商" required>
            <a-select v-model:value="formData.provider">
              <a-select-option value="deepseek">DeepSeek</a-select-option>
              <a-select-option value="openai">OpenAI</a-select-option>
              <a-select-option value="qwen">阿里通义千问</a-select-option>
              <a-select-option value="siliconflow">SiliconFlow 硅基流动</a-select-option>
              <a-select-option value="ollama">Ollama 本地私有化</a-select-option>
              <a-select-option value="custom">自定义供应商</a-select-option>
            </a-select>
          </a-form-item>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <a-form-item label="模型类型" required>
            <a-select v-model:value="formData.modelType">
              <a-select-option value="chat">对话模型 (Chat)</a-select-option>
              <a-select-option value="embedding">向量模型 (Embedding 1536维)</a-select-option>
              <a-select-option value="rerank">重排模型 (Rerank)</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="模型名称" required>
            <a-input v-model:value="formData.modelName" placeholder="如 deepseek-chat 或 text-embedding-3-small" />
          </a-form-item>
        </div>

        <a-form-item label="接口 Base URL" required>
          <a-input v-model:value="formData.baseUrl" placeholder="https://api.deepseek.com/v1" />
        </a-form-item>

        <a-form-item label="API Key (密钥)">
          <a-input-password v-model:value="formData.apiKey" placeholder="sk-..." />
        </a-form-item>

        <div class="grid grid-cols-3 gap-3">
          <a-form-item label="温度 (Temperature)">
            <a-input-number v-model:value="formData.temperature" :min="0" :max="2" :step="0.1" class="w-full" />
          </a-form-item>
          <a-form-item label="最大 Tokens">
            <a-input-number v-model:value="formData.maxTokens" :min="100" :max="32768" class="w-full" />
          </a-form-item>
          <a-form-item label="向量维度">
            <a-input-number v-model:value="formData.dimensions" :min="1" :max="4096" class="w-full" />
          </a-form-item>
        </div>

        <a-form-item label="是否设为默认">
          <a-switch
            :checked="formData.isDefault === '1'"
            @change="(val: any) => (formData.isDefault = val ? '1' : '0')"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { message as antdMessage } from 'antdv-next';

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
import {
  getModelConfigsApi,
  createModelConfigApi,
  updateModelConfigApi,
  deleteModelConfigApi,
  setDefaultModelConfigApi,
  type ModelConfig,
} from '#/api/ai/model';

const loading = ref(false);
const modelList = ref<ModelConfig[]>([]);
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
});

const columns = [
  { title: '模型名称', key: 'name', dataIndex: 'name', width: 220 },
  { title: '供应商', key: 'provider', dataIndex: 'provider', width: 130 },
  { title: '模型类型', key: 'modelType', dataIndex: 'modelType', width: 140 },
  { title: 'Base URL', key: 'baseUrl', dataIndex: 'baseUrl' },
  { title: '状态', key: 'status', dataIndex: 'status', width: 90 },
  { title: '创建时间', key: 'createTime', dataIndex: 'createTime', width: 180 },
  { title: '操作', key: 'action', width: 200 },
];

const modalVisible = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const formData = reactive<ModelConfig>({
  name: '',
  provider: 'deepseek',
  modelType: 'chat',
  modelName: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 4096,
  dimensions: 1536,
  isDefault: '0',
  status: '0',
});

onMounted(() => {
  loadData();
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getModelConfigsApi({
      pageNum: pagination.current,
      pageSize: pagination.pageSize,
    });
    modelList.value = res.rows || [];
    pagination.total = res.total || 0;
  } catch (err: any) {
    message.error(err.message || '加载模型列表失败');
  } finally {
    loading.value = false;
  }
}

function handleTableChange(pag: any) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadData();
}

function getProviderColor(provider?: string) {
  switch (provider?.toLowerCase()) {
    case 'deepseek':
      return 'blue';
    case 'openai':
      return 'green';
    case 'qwen':
      return 'orange';
    case 'siliconflow':
      return 'purple';
    default:
      return 'default';
  }
}

function openCreateModal() {
  editingId.value = null;
  formData.name = '';
  formData.provider = 'deepseek';
  formData.modelType = 'chat';
  formData.modelName = 'deepseek-chat';
  formData.baseUrl = 'https://api.deepseek.com/v1';
  formData.apiKey = '';
  formData.temperature = 0.7;
  formData.maxTokens = 4096;
  formData.dimensions = 1536;
  formData.isDefault = '0';
  formData.status = '0';
  modalVisible.value = true;
}

function openEditModal(record: ModelConfig) {
  editingId.value = record.id || null;
  formData.name = record.name;
  formData.provider = record.provider || 'deepseek';
  formData.modelType = record.modelType || 'chat';
  formData.modelName = record.modelName;
  formData.baseUrl = record.baseUrl || '';
  formData.apiKey = record.apiKey || '';
  formData.temperature = record.temperature ?? 0.7;
  formData.maxTokens = record.maxTokens ?? 4096;
  formData.dimensions = record.dimensions ?? 1536;
  formData.isDefault = record.isDefault || '0';
  formData.status = record.status || '0';
  modalVisible.value = true;
}

async function handleSave() {
  if (!formData.name || !formData.modelName || !formData.baseUrl) {
    message.warning('请补全必要配置项');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateModelConfigApi({ ...formData, id: editingId.value });
      message.success('更新成功');
    } else {
      await createModelConfigApi(formData);
      message.success('创建成功');
    }
    modalVisible.value = false;
    loadData();
  } catch (err: any) {
    message.error(err.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function handleDelete(id?: number) {
  if (!id) return;
  try {
    await deleteModelConfigApi(id);
    message.success('删除成功');
    loadData();
  } catch (err: any) {
    message.error(err.message || '删除失败');
  }
}

async function handleSetDefault(id?: number) {
  if (!id) return;
  try {
    await setDefaultModelConfigApi(id);
    message.success('已设为默认模型');
    loadData();
  } catch (err: any) {
    message.error(err.message || '操作失败');
  }
}
</script>

<style scoped>
.internal-table :deep(.ant-table-body) {
  overflow-y: auto !important;
  overflow-x: auto !important;
}
.internal-table :deep(.ant-table-header) {
  position: sticky;
  top: 0;
  z-index: 2;
}
</style>
