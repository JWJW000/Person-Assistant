<template>
  <div class="p-4 space-y-4">
    <!-- 顶部卡片：知识库概览与操作 -->
    <a-card title="📚 企业级知识库中心 (PostgreSQL pgvector)" :bordered="false">
      <template #extra>
        <a-space>
          <a-button type="primary" @click="openCreateModal">
            + 新建知识库
          </a-button>
          <a-button @click="loadData">
            刷新
          </a-button>
        </a-space>
      </template>

      <!-- 知识库表格 -->
      <a-table
        :columns="columns"
        :data-source="kbList"
        :loading="loading"
        row-key="id"
        :pagination="pagination"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="font-medium text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>📖 {{ record.name }}</span>
              <a-tag v-if="record.isPublic === '1'" color="blue">公开</a-tag>
              <a-tag v-else color="default">私有</a-tag>
            </div>
            <div class="text-xs text-zinc-400 mt-1 line-clamp-1">
              {{ record.description || '暂无描述' }}
            </div>
          </template>

          <template v-else-if="column.key === 'config'">
            <div class="text-xs space-y-0.5 text-zinc-500">
              <div>切片大小: <span class="font-mono text-zinc-800 dark:text-zinc-200">{{ record.chunkSize || 500 }}</span> 字符</div>
              <div>重叠字数: <span class="font-mono text-zinc-800 dark:text-zinc-200">{{ record.chunkOverlap || 50 }}</span> 字符</div>
            </div>
          </template>

          <template v-else-if="column.key === 'status'">
            <a-tag :color="record.status === '0' ? 'success' : 'error'">
              {{ record.status === '0' ? '正常' : '已停用' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="openChunkDrawer(record)">
                切片明细
              </a-button>
              <a-button type="link" size="small" @click="openSearchDrawer(record)">
                检索沙盒
              </a-button>
              <a-button type="link" size="small" @click="openEditModal(record)">
                编辑
              </a-button>
              <a-popconfirm title="确定删除该知识库？将同时清理所有关联切片！" @confirm="handleDelete(record.id)">
                <a-button type="link" size="small" danger>
                  删除
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 弹窗：新建 / 编辑知识库 -->
    <a-modal
      v-model:open="modalVisible"
      :title="editingId ? '编辑知识库' : '新建知识库'"
      @ok="handleSaveKb"
      :confirm-loading="saving"
    >
      <a-form layout="vertical" :model="formData">
        <a-form-item label="知识库名称" required>
          <a-input v-model:value="formData.name" placeholder="例如：产品技术手册、财务规章制度" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="formData.description" placeholder="知识库覆盖范围与用途说明" :rows="3" />
        </a-form-item>
        <div class="grid grid-cols-2 gap-4">
          <a-form-item label="切片大小 (字符)">
            <a-input-number v-model:value="formData.chunkSize" :min="100" :max="2000" class="w-full" />
          </a-form-item>
          <a-form-item label="重叠字数 (字符)">
            <a-input-number v-model:value="formData.chunkOverlap" :min="0" :max="500" class="w-full" />
          </a-form-item>
        </div>
        <a-form-item label="公开属性">
          <a-radio-group v-model:value="formData.isPublic">
            <a-radio value="0">私有 (仅管理员与授权人员可见)</a-radio>
            <a-radio value="1">公开 (全员对话可检索)</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 抽屉：切片管理与文本入库 -->
    <a-drawer
      v-model:open="chunkDrawerVisible"
      :title="`切片明细 - ${activeKb?.name || ''}`"
      width="780px"
    >
      <div class="space-y-4">
        <div class="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div>
            <div class="text-sm font-medium">文本切片与 pgvector 向量化</div>
            <div class="text-xs text-zinc-400">支持直接粘贴长文本，服务端自动切分并生成 1536 维向量入库</div>
          </div>
          <a-button type="primary" @click="chunkModalVisible = true">
            + 文本切片入库
          </a-button>
        </div>

        <a-table
          :columns="chunkColumns"
          :data-source="chunkList"
          :loading="chunkLoading"
          row-key="id"
          size="small"
          :pagination="chunkPagination"
          @change="handleChunkTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'content'">
              <div class="text-xs leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap font-mono bg-zinc-50 dark:bg-zinc-900 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                {{ record.content }}
              </div>
            </template>
            <template v-else-if="column.key === 'action'">
              <a-popconfirm title="确定删除该切片？" @confirm="handleDeleteChunk(record.id)">
                <a-button type="link" size="small" danger>删除</a-button>
              </a-popconfirm>
            </template>
          </template>
        </a-table>
      </div>
    </a-drawer>

    <!-- 弹窗：录入文本并切片 -->
    <a-modal
      v-model:open="chunkModalVisible"
      title="文本切片与向量化入库"
      width="640px"
      @ok="handleDoChunk"
      :confirm-loading="chunking"
    >
      <a-form layout="vertical" :model="chunkFormData">
        <a-form-item label="文档/片段标题" required>
          <a-input v-model:value="chunkFormData.title" placeholder="如：系统架构概览" />
        </a-form-item>
        <a-form-item label="切片内容正文" required>
          <a-textarea
            v-model:value="chunkFormData.content"
            placeholder="粘贴待切片的文档正文，系统将按知识库配置的切片与重叠字数自动分块并写入 pgvector 向量库..."
            :rows="8"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 抽屉：pgvector 语义检索沙盒 -->
    <a-drawer
      v-model:open="searchDrawerVisible"
      :title="`pgvector 向量检索沙盒 - ${activeKb?.name || ''}`"
      width="680px"
    >
      <div class="space-y-4">
        <div class="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg text-xs text-blue-700 dark:text-blue-300">
          💡 本沙盒基于 PostgreSQL pgvector HNSW 余弦相似度索引进行语义匹配，分值越接近 1.0 表示向量夹角余弦越近。
        </div>

        <div class="space-y-2">
          <a-textarea
            v-model:value="searchQuery"
            placeholder="输入您想检索的问题或关键词..."
            :rows="3"
            @press-enter.prevent="handleSearch"
          />
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4 text-xs text-zinc-500">
              <span class="flex items-center gap-1">Top-K:
                <a-input-number v-model:value="searchTopK" :min="1" :max="20" size="small" />
              </span>
              <span class="flex items-center gap-1">最低相似度:
                <a-input-number v-model:value="searchMinScore" :min="0" :max="1" :step="0.05" size="small" />
              </span>
            </div>
            <a-button type="primary" :loading="searching" @click="handleSearch">
              🔍 执行向量检索
            </a-button>
          </div>
        </div>

        <div v-if="searchResults.length > 0" class="space-y-3 pt-2">
          <div class="text-xs font-medium text-zinc-500">命中结果 ({{ searchResults.length }} 条)：</div>
          <div
            v-for="(item, idx) in searchResults"
            :key="item.id || idx"
            class="p-3.5 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm space-y-2"
          >
            <div class="flex items-center justify-between">
              <span class="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200">
                #{{ idx + 1 }} 切片 (Order: {{ item.chunkOrder }})
              </span>
              <a-tag :color="item.score && item.score >= 0.7 ? 'success' : item.score && item.score >= 0.5 ? 'processing' : 'warning'">
                相似度得分: {{ item.score ?? 'N/A' }}
              </a-tag>
            </div>
            <div class="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap">
              {{ item.content }}
            </div>
          </div>
        </div>

        <div v-else-if="searched" class="text-center py-8 text-zinc-400 text-xs">
          未检索到符合相似度门槛的切片内容
        </div>
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';

const message = {
  success: (msg: string) => {
    if (typeof window !== 'undefined' && (window as any).message) {
      (window as any).message.success(msg);
    }
  },
  error: (msg: string) => {
    if (typeof window !== 'undefined' && (window as any).message) {
      (window as any).message.error(msg);
    }
  },
  warning: (msg: string) => {
    if (typeof window !== 'undefined' && (window as any).message) {
      (window as any).message.warning(msg);
    }
  },
};
import {
  getKnowledgeBasesApi,
  createKnowledgeBaseApi,
  updateKnowledgeBaseApi,
  deleteKnowledgeBaseApi,
  chunkTextApi,
  getKnowledgeChunksApi,
  deleteKnowledgeChunkApi,
  searchKnowledgeChunksApi,
  type KnowledgeBase,
  type KnowledgeChunk,
} from '#/api/ai/knowledge';

const loading = ref(false);
const kbList = ref<KnowledgeBase[]>([]);
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
});

const columns = [
  { title: '知识库名称', key: 'name', width: 280 },
  { title: '切片配置', key: 'config', width: 180 },
  { title: '状态', key: 'status', width: 100 },
  { title: '创建时间', dataIndex: 'createTime', width: 180 },
  { title: '操作', key: 'action', width: 260 },
];

const modalVisible = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const formData = reactive<KnowledgeBase>({
  name: '',
  description: '',
  chunkSize: 500,
  chunkOverlap: 50,
  isPublic: '0',
  status: '0',
});

// 切片明细
const activeKb = ref<KnowledgeBase | null>(null);
const chunkDrawerVisible = ref(false);
const chunkLoading = ref(false);
const chunkList = ref<KnowledgeChunk[]>([]);
const chunkPagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
});

const chunkColumns = [
  { title: '序号', dataIndex: 'chunkOrder', width: 70 },
  { title: '字数', dataIndex: 'tokenCount', width: 80 },
  { title: '切片内容', key: 'content' },
  { title: '操作', key: 'action', width: 80 },
];

const chunkModalVisible = ref(false);
const chunking = ref(false);
const chunkFormData = reactive({
  title: '',
  content: '',
});

// 检索沙盒
const searchDrawerVisible = ref(false);
const searchQuery = ref('');
const searchTopK = ref(5);
const searchMinScore = ref(0.2);
const searching = ref(false);
const searched = ref(false);
const searchResults = ref<KnowledgeChunk[]>([]);

onMounted(() => {
  loadData();
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getKnowledgeBasesApi({
      pageNum: pagination.current,
      pageSize: pagination.pageSize,
    });
    kbList.value = res.rows || [];
    pagination.total = res.total || 0;
  } catch (err: any) {
    message.error(err.message || '加载知识库失败');
  } finally {
    loading.value = false;
  }
}

function handleTableChange(pag: any) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadData();
}

function openCreateModal() {
  editingId.value = null;
  formData.name = '';
  formData.description = '';
  formData.chunkSize = 500;
  formData.chunkOverlap = 50;
  formData.isPublic = '0';
  formData.status = '0';
  modalVisible.value = true;
}

function openEditModal(record: KnowledgeBase) {
  editingId.value = record.id || null;
  formData.name = record.name;
  formData.description = record.description || '';
  formData.chunkSize = record.chunkSize || 500;
  formData.chunkOverlap = record.chunkOverlap || 50;
  formData.isPublic = record.isPublic || '0';
  formData.status = record.status || '0';
  modalVisible.value = true;
}

async function handleSaveKb() {
  if (!formData.name) {
    message.warning('请输入知识库名称');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateKnowledgeBaseApi({ ...formData, id: editingId.value });
      message.success('更新成功');
    } else {
      await createKnowledgeBaseApi(formData);
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
    await deleteKnowledgeBaseApi(id);
    message.success('知识库删除成功');
    loadData();
  } catch (err: any) {
    message.error(err.message || '删除失败');
  }
}

// 切片抽屉与分块
function openChunkDrawer(record: KnowledgeBase) {
  activeKb.value = record;
  chunkPagination.current = 1;
  chunkDrawerVisible.value = true;
  loadChunks();
}

async function loadChunks() {
  if (!activeKb.value?.id) return;
  chunkLoading.value = true;
  try {
    const res = await getKnowledgeChunksApi(activeKb.value.id, {
      pageNum: chunkPagination.current,
      pageSize: chunkPagination.pageSize,
    });
    chunkList.value = res.rows || [];
    chunkPagination.total = res.total || 0;
  } catch (err: any) {
    message.error(err.message || '加载切片失败');
  } finally {
    chunkLoading.value = false;
  }
}

function handleChunkTableChange(pag: any) {
  chunkPagination.current = pag.current;
  chunkPagination.pageSize = pag.pageSize;
  loadChunks();
}

async function handleDoChunk() {
  if (!chunkFormData.content.trim()) {
    message.warning('请输入正文文本');
    return;
  }
  if (!activeKb.value?.id) return;

  chunking.value = true;
  try {
    const res = await chunkTextApi({
      kbId: activeKb.value.id,
      title: chunkFormData.title || '长文本片段',
      content: chunkFormData.content,
      chunkSize: activeKb.value.chunkSize || 500,
      chunkOverlap: activeKb.value.chunkOverlap || 50,
    });
    message.success(`切片完成！成功向量化入库 ${res.chunkCount} 个切片`);
    chunkModalVisible.value = false;
    chunkFormData.title = '';
    chunkFormData.content = '';
    loadChunks();
  } catch (err: any) {
    message.error(err.message || '切片失败');
  } finally {
    chunking.value = false;
  }
}

async function handleDeleteChunk(id?: number) {
  if (!id) return;
  try {
    await deleteKnowledgeChunkApi(id);
    message.success('切片已删除');
    loadChunks();
  } catch (err: any) {
    message.error(err.message || '删除切片失败');
  }
}

// 检索沙盒
function openSearchDrawer(record: KnowledgeBase) {
  activeKb.value = record;
  searchQuery.value = '';
  searchResults.value = [];
  searched.value = false;
  searchDrawerVisible.value = true;
}

async function handleSearch() {
  if (!searchQuery.value.trim() || !activeKb.value?.id) {
    message.warning('请输入检索内容');
    return;
  }
  searching.value = true;
  searched.value = true;
  try {
    const res = await searchKnowledgeChunksApi({
      kbId: activeKb.value.id,
      query: searchQuery.value.trim(),
      topK: searchTopK.value,
      minScore: searchMinScore.value,
    });
    searchResults.value = res || [];
  } catch (err: any) {
    message.error(err.message || '检索失败');
  } finally {
    searching.value = false;
  }
}
</script>
