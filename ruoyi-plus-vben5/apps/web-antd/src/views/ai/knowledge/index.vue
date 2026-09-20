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
            <div
              class="font-medium text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors"
              @click="openChunkDrawer(record)"
              title="点击进入知识库补充知识与维护切片"
            >
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
                知识补充 / 明细
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

    <!-- 抽屉：切片管理与知识补充 -->
    <a-drawer
      v-model:open="chunkDrawerVisible"
      :title="`知识库维护与知识补充 - ${activeKb?.name || ''}`"
      width="860px"
    >
      <div class="space-y-4">
        <!-- 头部概览与补充操作按钮 -->
        <div class="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div>
            <div class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>📖 {{ activeKb?.name }}</span>
              <a-tag color="blue">已收录 {{ chunkPagination.total }} 条</a-tag>
            </div>
            <div class="text-xs text-zinc-400 mt-1">
              切片大小: {{ activeKb?.chunkSize || 500 }} 字符 · 重叠: {{ activeKb?.chunkOverlap || 50 }} 字符 · pgvector 1536维
            </div>
          </div>

          <a-space>
            <a-button type="primary" @click="openAddKnowledgeModal('qa')">
              + 补充 QA 问答对
            </a-button>
            <a-button @click="openAddKnowledgeModal('text')">
              + 补充长文本切片
            </a-button>
          </a-space>
        </div>

        <!-- 过滤工具栏 -->
        <div class="flex items-center justify-between gap-4">
          <a-radio-group v-model:value="chunkFilterType" button-style="solid" size="small">
            <a-radio-button value="all">全部 ({{ chunkList.length }})</a-radio-button>
            <a-radio-button value="qa">仅看 QA 问答对</a-radio-button>
            <a-radio-button value="text">仅看文本切片</a-radio-button>
          </a-radio-group>

          <a-input-search
            v-model:value="chunkSearchKeyword"
            placeholder="搜索问答或切片内容..."
            allow-clear
            size="small"
            class="max-w-xs"
          />
        </div>

        <a-table
          :columns="chunkColumns"
          :data-source="filteredChunkList"
          :loading="chunkLoading"
          row-key="id"
          size="small"
          :pagination="chunkPagination"
          @change="handleChunkTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'chunkType'">
              <a-tag v-if="record.chunkType === 'qa'" color="purple">
                QA 问答对
              </a-tag>
              <a-tag v-else color="blue">
                文本切片
              </a-tag>
            </template>

            <template v-else-if="column.key === 'titleOrQuestion'">
              <div v-if="record.chunkType === 'qa'" class="font-medium text-xs text-purple-900 dark:text-purple-300">
                <span class="font-bold mr-1">Q:</span>{{ record.question || '-' }}
              </div>
              <div v-else class="text-xs text-zinc-500 font-mono">
                #{{ record.chunkOrder }} 文本切片
              </div>
            </template>

            <template v-else-if="column.key === 'content'">
              <div class="text-xs leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap font-mono bg-zinc-50 dark:bg-zinc-900 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                <span v-if="record.chunkType === 'qa'" class="font-bold text-zinc-700 dark:text-zinc-300 mr-1">A:</span>
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

    <!-- 弹窗：录入并补充知识内容 (支持 QA 问答对与长文本切片) -->
    <a-modal
      v-model:open="chunkModalVisible"
      :title="`补充知识内容 - ${chunkFormData.chunkType === 'qa' ? 'QA 问答对 (精准匹配)' : '长文本切片 (自动分块)'}`"
      width="680px"
      :z-index="2000"
      :wrap-class-name="'z-[2000]'"
      ok-text="确认入库"
      cancel-text="取消"
      @ok="handleDoChunk"
      :confirm-loading="chunking"
    >
      <a-form layout="vertical" :model="chunkFormData" class="mt-2">
        <a-form-item label="补充类型">
          <a-radio-group v-model:value="chunkFormData.chunkType" button-style="solid">
            <a-radio-button value="qa">QA 问答对 (精准匹配)</a-radio-button>
            <a-radio-button value="text">长文本切片 (自动分块)</a-radio-button>
          </a-radio-group>
        </a-form-item>

        <!-- QA 问答对模式 -->
        <template v-if="chunkFormData.chunkType === 'qa'">
          <a-form-item label="标准问题 (Q)" required>
            <template #extra>
              <span class="text-xs text-purple-600 dark:text-purple-400">
                ⚡ 仅对问题生成 1536 维语义向量，用户提问语义相近时将以 0.8+ 高精度命中召回。
              </span>
            </template>
            <a-input
              v-model:value="chunkFormData.question"
              placeholder="例如：我女朋友叫什么？ / 公司上下班作息时间是什么？"
            />
          </a-form-item>

          <a-form-item label="标准回答 (A)" required>
            <template #extra>
              <span class="text-xs text-zinc-400">
                检索命中后将作为确定性记忆事实注入大模型进行回复。
              </span>
            </template>
            <a-textarea
              v-model:value="chunkFormData.content"
              placeholder="输入标准、准确的解答内容..."
              :rows="6"
            />
          </a-form-item>
        </template>

        <!-- 长文本切片模式 -->
        <template v-else>
          <a-form-item label="文档/片段标题 (可选)">
            <a-input v-model:value="chunkFormData.title" placeholder="如：系统架构规范、员工差旅报销标准" />
          </a-form-item>
          <a-form-item label="切片正文文本" required>
            <template #extra>
              <span class="text-xs text-zinc-400">
                系统将按该知识库配置的切片大小 ({{ activeKb?.chunkSize || 500 }}字) 与重叠字数自动滑动窗口切分并写入 pgvector 向量库。
              </span>
            </template>
            <a-textarea
              v-model:value="chunkFormData.content"
              placeholder="粘贴待切片的文章、规章、方案长文..."
              :rows="8"
            />
          </a-form-item>
        </template>
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
import { ref, reactive, computed, onMounted } from 'vue';

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
  { title: '操作', key: 'action', width: 280 },
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

// 切片与知识明细
const activeKb = ref<KnowledgeBase | null>(null);
const chunkDrawerVisible = ref(false);
const chunkLoading = ref(false);
const chunkList = ref<KnowledgeChunk[]>([]);
const chunkPagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
});

const chunkFilterType = ref<'all' | 'qa' | 'text'>('all');
const chunkSearchKeyword = ref('');

const filteredChunkList = computed(() => {
  return chunkList.value.filter((item) => {
    if (chunkFilterType.value === 'qa' && item.chunkType !== 'qa') return false;
    if (chunkFilterType.value === 'text' && item.chunkType === 'qa') return false;
    if (chunkSearchKeyword.value.trim()) {
      const kw = chunkSearchKeyword.value.trim().toLowerCase();
      const matchQ = item.question?.toLowerCase().includes(kw);
      const matchC = item.content?.toLowerCase().includes(kw);
      return matchQ || matchC;
    }
    return true;
  });
});

const chunkColumns = [
  { title: '序号', dataIndex: 'chunkOrder', width: 65 },
  { title: '类型', key: 'chunkType', width: 105 },
  { title: '问题 / 标题', key: 'titleOrQuestion', width: 220 },
  { title: '切片/答案内容', key: 'content' },
  { title: '字数', dataIndex: 'tokenCount', width: 75 },
  { title: '操作', key: 'action', width: 75 },
];

const chunkModalVisible = ref(false);
const chunking = ref(false);
const chunkFormData = reactive({
  chunkType: 'qa' as 'qa' | 'text',
  question: '',
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

// 切片抽屉与知识补充
function openChunkDrawer(record: KnowledgeBase) {
  activeKb.value = record;
  chunkPagination.current = 1;
  chunkFilterType.value = 'all';
  chunkSearchKeyword.value = '';
  chunkDrawerVisible.value = true;
  loadChunks();
}

function openAddKnowledgeModal(type: 'qa' | 'text' = 'qa') {
  chunkFormData.chunkType = type;
  chunkFormData.question = '';
  chunkFormData.title = '';
  chunkFormData.content = '';
  chunkModalVisible.value = true;
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
    message.error(err.message || '加载知识明细失败');
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
  if (!activeKb.value?.id) {
    message.error('未绑定有效知识库，请重新打开抽屉');
    return;
  }

  if (chunkFormData.chunkType === 'qa') {
    if (!chunkFormData.question || !chunkFormData.question.trim()) {
      message.warning('请输入标准问题 (Q)');
      return;
    }
    if (!chunkFormData.content || !chunkFormData.content.trim()) {
      message.warning('请输入标准回答 (A)');
      return;
    }
  } else {
    if (!chunkFormData.content || !chunkFormData.content.trim()) {
      message.warning('请输入切片正文文本');
      return;
    }
  }

  chunking.value = true;
  try {
    const res = await chunkTextApi({
      kbId: activeKb.value.id,
      chunkType: chunkFormData.chunkType,
      question: chunkFormData.chunkType === 'qa' ? chunkFormData.question.trim() : undefined,
      title: chunkFormData.title?.trim() || (chunkFormData.chunkType === 'qa' ? chunkFormData.question.trim() : '长文本片段'),
      content: chunkFormData.content.trim(),
      chunkSize: activeKb.value.chunkSize || 500,
      chunkOverlap: activeKb.value.chunkOverlap || 50,
    });

    message.success(
      chunkFormData.chunkType === 'qa'
        ? 'QA 问答对已成功入库（已对问题完成 1536 维向量化）'
        : `切片完成！成功向量化入库 ${res?.chunkCount ?? 0} 个切片`
    );
    chunkModalVisible.value = false;
    chunkFormData.question = '';
    chunkFormData.title = '';
    chunkFormData.content = '';
    loadChunks();
  } catch (err: any) {
    console.error('知识录入入库失败:', err);
    message.error(err?.msg || err?.message || '知识入库失败，请检查后端服务是否正常');
  } finally {
    chunking.value = false;
  }
}

async function handleDeleteChunk(id?: number) {
  if (!id) return;
  try {
    await deleteKnowledgeChunkApi(id);
    message.success('知识条目已删除');
    loadChunks();
  } catch (err: any) {
    message.error(err.message || '删除失败');
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
