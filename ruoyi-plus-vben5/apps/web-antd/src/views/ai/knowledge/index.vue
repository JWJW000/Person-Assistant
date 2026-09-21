<template>
  <div class="h-[calc(100vh-90px)] flex flex-col overflow-hidden p-4 select-none">
    <!-- =================================================================================== -->
    <!-- 模式一：知识库列表概览页面 (viewMode === 'list')                                     -->
    <!-- =================================================================================== -->
    <template v-if="viewMode === 'list'">
      <a-card
        title="📚 企业级知识库中心 (PostgreSQL pgvector)"
        :bordered="false"
        class="flex-1 min-h-0 flex flex-col overflow-hidden shadow-xs rounded-xl"
        :body-style="{ flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }"
      >
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

        <!-- 表格滚动区域 (列表内滑动) -->
        <div class="flex-1 min-h-0 overflow-hidden">
          <a-table
            :columns="columns"
            :data-source="kbList"
            :loading="loading"
            row-key="id"
            :pagination="false"
            :scroll="{ y: 'calc(100vh - 275px)', x: 1000 }"
            class="internal-table"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <div
                  class="font-medium text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors"
                  @click="enterDetailPage(record)"
                  title="点击进入独立页面维护知识库与切片片段"
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
                  <a-button type="primary" ghost size="small" @click="enterDetailPage(record)">
                    知识维护 / 片段管理
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
        </div>

        <!-- 底部固定分页栏 (真正固定在底栏，列表在上方滑动) -->
        <div class="shrink-0 bg-white dark:bg-zinc-900 px-4 py-3 border-t border-zinc-200/80 dark:border-zinc-800 flex justify-between items-center shadow-xs rounded-b-xl z-10">
          <div class="text-xs text-zinc-500">
            共 <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ pagination.total }}</span> 个知识库，当前第 {{ pagination.current }} / {{ Math.ceil(pagination.total / pagination.pageSize) || 1 }} 页
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
    </template>

    <!-- =================================================================================== -->
    <!-- 模式二：知识库片段维护与编辑独立页面 (viewMode === 'detail', 列表内滑动 + 底栏固定)     -->
    <!-- =================================================================================== -->
    <template v-else-if="viewMode === 'detail'">
      <!-- 面包屑返回条 (固定在顶部) -->
      <div class="shrink-0 flex items-center justify-between bg-white dark:bg-zinc-900 px-4 py-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs mb-2.5">
        <div class="flex items-center gap-2">
          <a-button type="link" @click="backToList" class="p-0 font-semibold text-sm flex items-center gap-1.5 text-blue-600 hover:text-blue-700 cursor-pointer">
            ← 返回知识库列表
          </a-button>
          <span class="text-zinc-300 dark:text-zinc-700">/</span>
          <span class="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            📖 {{ activeKb?.name }} · 知识片段与问答维护
          </span>
        </div>

        <a-space>
          <a-button type="primary" @click="openAddKnowledgeModal('qa')">
            + 补充 QA 问答对
          </a-button>
          <a-button @click="openAddKnowledgeModal('text')">
            + 补充长文本切片
          </a-button>
          <a-button @click="openSearchDrawer(activeKb!)">
            检索沙盒测试
          </a-button>
          <a-button @click="loadChunks">
            刷新
          </a-button>
        </a-space>
      </div>

      <!-- 知识库核心信息看板条 (固定在顶部) -->
      <div class="shrink-0 bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex flex-wrap items-center justify-between gap-4 mb-2.5">
        <div class="space-y-0.5">
          <div class="flex items-center gap-2.5">
            <h2 class="text-base font-bold text-zinc-900 dark:text-zinc-100 m-0">
              {{ activeKb?.name }}
            </h2>
            <a-tag v-if="activeKb?.isPublic === '1'" color="blue">公开知识库</a-tag>
            <a-tag v-else color="default">私有知识库 (仅本人可见)</a-tag>
            <a-tag color="purple">PostgreSQL pgvector (1536维)</a-tag>
          </div>
          <p class="text-xs text-zinc-500 m-0 line-clamp-1 max-w-2xl">
            {{ activeKb?.description || '暂无详细描述信息' }}
          </p>
        </div>

        <div class="flex items-center gap-6 text-xs text-zinc-500 font-mono">
          <div>切片容量: <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ activeKb?.chunkSize || 500 }}</span> 字符</div>
          <div>重叠跨度: <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ activeKb?.chunkOverlap || 50 }}</span> 字符</div>
          <div>总知识条目: <span class="font-bold text-blue-600 text-sm">{{ chunkPagination.total }}</span> 条</div>
        </div>
      </div>

      <!-- 主体卡片 (flex-1 撑满剩余高度，内部表格滑动，底栏固定) -->
      <a-card
        :bordered="false"
        class="flex-1 min-h-0 flex flex-col overflow-hidden shadow-xs rounded-xl"
        :body-style="{ flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column', padding: '12px 16px 0 16px', overflow: 'hidden' }"
      >
        <!-- 过滤器与搜索框 (固定在表格上方) -->
        <div class="shrink-0 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800 mb-2">
          <div class="flex items-center gap-2">
            <a-radio-group v-model:value="chunkFilterType" button-style="solid" size="small" @change="handleFilterChange">
              <a-radio-button value="all">全部类型 ({{ chunkPagination.total }})</a-radio-button>
              <a-radio-button value="qa">仅看 QA 问答对</a-radio-button>
              <a-radio-button value="text">仅看长文本切片</a-radio-button>
            </a-radio-group>
          </div>

          <div class="flex items-center gap-2">
            <a-input-search
              v-model:value="chunkSearchKeyword"
              placeholder="搜索标准问题 (Q) 或 正文内容关键字..."
              allow-clear
              size="small"
              class="w-80"
              @search="handleSearchChunks"
              @pressEnter="handleSearchChunks"
            />
          </div>
        </div>

        <!-- 切片数据表格 (列表内滑动内部滚动区域) -->
        <div class="flex-1 min-h-0 overflow-hidden">
          <a-table
            :columns="chunkColumns"
            :data-source="chunkList"
            :loading="chunkLoading"
            row-key="id"
            size="middle"
            :pagination="false"
            :scroll="{ y: 'calc(100vh - 380px)', x: 1100 }"
            class="internal-table"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'id'">
                <span class="text-xs font-mono text-zinc-400">#{{ (chunkPagination.current - 1) * chunkPagination.pageSize + index + 1 }}</span>
              </template>

              <template v-else-if="column.key === 'chunkType'">
                <a-tag v-if="record.chunkType === 'qa'" color="purple" class="font-semibold">
                  QA 问答对
                </a-tag>
                <a-tag v-else color="blue" class="font-semibold">
                  文本切片
                </a-tag>
              </template>

              <template v-else-if="column.key === 'titleOrQuestion'">
                <div v-if="record.chunkType === 'qa'" class="font-medium text-sm text-purple-900 dark:text-purple-300">
                  <span class="font-bold text-purple-600 mr-1.5">Q:</span>
                  <span class="select-text">{{ record.question || '-' }}</span>
                </div>
                <div v-else class="text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                  {{ record.question || `#${record.chunkOrder || 1} 文本片段` }}
                </div>
              </template>

              <template v-else-if="column.key === 'content'">
                <div class="text-xs leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap font-mono bg-zinc-50 dark:bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 select-text">
                  <span v-if="record.chunkType === 'qa'" class="font-bold text-emerald-600 mr-1.5">A:</span>
                  {{ record.content }}
                </div>
              </template>

              <template v-else-if="column.key === 'tokenCount'">
                <span class="text-xs font-mono text-zinc-500">{{ record.tokenCount || record.content?.length || 0 }} 字符</span>
              </template>

              <template v-else-if="column.key === 'createTime'">
                <span class="text-xs text-zinc-400 font-mono">{{ formatDateTime(record.createTime) }}</span>
              </template>

              <template v-else-if="column.key === 'action'">
                <a-space>
                  <a-button type="link" size="small" @click="openEditChunkModal(record)">
                    编辑
                  </a-button>
                  <a-popconfirm title="确定删除该切片条目？" @confirm="handleDeleteChunk(record.id)">
                    <a-button type="link" size="small" danger>
                      删除
                    </a-button>
                  </a-popconfirm>
                </a-space>
              </template>
            </template>
          </a-table>
        </div>

        <!-- 切片独立页面：底部固定底栏分页 (真正固定底栏，不随列表滚动) -->
        <div class="shrink-0 bg-white dark:bg-zinc-900 px-4 py-3 border-t border-zinc-200/80 dark:border-zinc-800 flex justify-between items-center shadow-xs -mx-4 rounded-b-xl z-10">
          <div class="text-xs text-zinc-500">
            共 <span class="font-bold text-zinc-800 dark:text-zinc-200">{{ chunkPagination.total }}</span> 条知识切片，当前第 {{ chunkPagination.current }} / {{ Math.ceil(chunkPagination.total / chunkPagination.pageSize) || 1 }} 页
          </div>
          <a-pagination
            v-model:current="chunkPagination.current"
            v-model:page-size="chunkPagination.pageSize"
            :total="chunkPagination.total"
            :show-size-changer="true"
            :show-quick-jumper="true"
            :page-size-options="['10', '20', '50', '100']"
            size="small"
            @change="loadChunks"
          />
        </div>
      </a-card>
    </template>

    <!-- 弹窗：新建 / 编辑知识库元数据 -->
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
            <a-radio value="0">私有 (仅本人可见并调用)</a-radio>
            <a-radio value="1">公开 (全员对话可检索)</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 弹窗：新增知识内容 (QA问答对 / 长文本切片) -->
    <a-modal
      v-model:open="chunkModalVisible"
      :title="chunkFormData.chunkType === 'qa' ? '➕ 录入 QA 问答对词条' : '➕ 补充长文本切片知识'"
      @ok="handleDoChunk"
      :confirm-loading="chunking"
      width="680px"
    >
      <a-form layout="vertical">
        <a-form-item label="录入知识类型">
          <a-radio-group v-model:value="chunkFormData.chunkType" button-style="solid">
            <a-radio-button value="qa">💬 QA 问答对 (精准匹配推荐)</a-radio-button>
            <a-radio-button value="text">📄 长文本内容 (自动切片)</a-radio-button>
          </a-radio-group>
        </a-form-item>

        <template v-if="chunkFormData.chunkType === 'qa'">
          <a-form-item label="标准问题 (Q)" required extra="将单独计算 1536 维向量，大模型提问相似问题时将精准命中召回">
            <a-input
              v-model:value="chunkFormData.question"
              placeholder="例如：我女朋友是谁？/ 公司的年假如何计算？"
            />
          </a-form-item>
          <a-form-item label="标准答案 (A)" required extra="大模型命中本词条后将直接作为事实依据回答用户">
            <a-textarea
              v-model:value="chunkFormData.content"
              placeholder="例如：你女朋友是王宇静。/ 员工入职满一年享有 5 天带薪年假..."
              :rows="5"
            />
          </a-form-item>
        </template>

        <template v-else>
          <a-form-item label="文档 / 切片标题" extra="便于管理与检索结果引用展示">
            <a-input v-model:value="chunkFormData.title" placeholder="例如：2026年出差差旅报销标准" />
          </a-form-item>
          <a-form-item
            label="长文本正文内容"
            required
            :extra="`系统将按当前知识库设置（切片大小: ${activeKb?.chunkSize || 500}字符，重叠: ${activeKb?.chunkOverlap || 50}字符）自动切片并生成向量`"
          >
            <a-textarea
              v-model:value="chunkFormData.content"
              placeholder="请粘贴大段技术手册、规章制度、操作规范或产品介绍文本..."
              :rows="8"
            />
          </a-form-item>
        </template>
      </a-form>
    </a-modal>

    <!-- 弹窗：编辑现有切片 / 问答词条 (支持重新计算向量入库) -->
    <a-modal
      v-model:open="editChunkModalVisible"
      :title="editingChunkData.chunkType === 'qa' ? '✏️ 编辑 QA 问答对词条' : '✏️ 编辑知识切片内容'"
      @ok="handleSaveEditChunk"
      :confirm-loading="savingChunk"
      width="680px"
    >
      <a-form layout="vertical">
        <a-form-item label="切片类型">
          <a-tag :color="editingChunkData.chunkType === 'qa' ? 'purple' : 'blue'" class="font-bold text-xs">
            {{ editingChunkData.chunkType === 'qa' ? 'QA 问答对词条' : '普通文本切片' }}
          </a-tag>
        </a-form-item>

        <template v-if="editingChunkData.chunkType === 'qa'">
          <a-form-item label="标准问题 (Q)" required extra="保存后将自动重新生成 1536 维向量并更新 pgvector">
            <a-input
              v-model:value="editingChunkData.question"
              placeholder="输入标准问题..."
            />
          </a-form-item>
          <a-form-item label="标准答案 (A)" required extra="大模型以此答案为知识依据">
            <a-textarea
              v-model:value="editingChunkData.content"
              placeholder="输入标准回答..."
              :rows="6"
            />
          </a-form-item>
        </template>

        <template v-else>
          <a-form-item label="标准问题 / 标题 (可选)">
            <a-input v-model:value="editingChunkData.question" placeholder="切片简要标题或问题描述" />
          </a-form-item>
          <a-form-item label="切片正文内容" required extra="保存后将自动重新计算并同步更新向量嵌入">
            <a-textarea
              v-model:value="editingChunkData.content"
              placeholder="切片正文内容..."
              :rows="7"
            />
          </a-form-item>
        </template>
      </a-form>
    </a-modal>

    <!-- 抽屉：语义向量检索沙盒测试 -->
    <a-drawer
      v-model:open="searchDrawerVisible"
      :title="`pgvector 语义向量检索沙盒 - ${activeKb?.name || ''}`"
      width="540px"
    >
      <div class="space-y-4">
        <a-alert
          message="基于 PostgreSQL pgvector HNSW 算法测试当前知识库的语义召回精度"
          type="info"
          show-icon
        />

        <a-form layout="vertical">
          <a-form-item label="检索测试提问 (模拟用户输入)">
            <a-textarea
              v-model:value="searchQuery"
              placeholder="例如：我女朋友叫什么？/ 报销需要什么发票？"
              :rows="3"
            />
          </a-form-item>
          <div class="grid grid-cols-2 gap-4">
            <a-form-item label="Top-K 返回数">
              <a-input-number v-model:value="searchTopK" :min="1" :max="10" class="w-full" />
            </a-form-item>
            <a-form-item label="最小相似度门槛">
              <a-input-number v-model:value="searchMinScore" :min="0" :max="1" :step="0.05" class="w-full" />
            </a-form-item>
          </div>
          <a-button type="primary" block :loading="searching" @click="handleSearch">
            执行语义召回
          </a-button>
        </a-form>
        
        <div v-if="searched" class="space-y-3 pt-2">
          <div class="text-xs font-semibold text-zinc-500 flex justify-between">
            <span>召回切片结果 ({{ searchResults.length }})</span>
            <span>余弦相似度得分</span>
          </div>

          <div v-if="searchResults.length === 0" class="text-center py-8 text-zinc-400 text-xs">
            未命中任何相似度 >= {{ searchMinScore }} 的切片内容
          </div>

          <div
            v-for="(item, idx) in searchResults"
            :key="idx"
            class="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-1.5 text-xs"
          >
            <div class="flex justify-between items-center">
              <span class="font-bold text-blue-600">
                #{{ idx + 1 }}
                <a-tag v-if="item.chunkType === 'qa'" color="purple" class="ml-1">QA问答</a-tag>
                <a-tag v-else color="blue" class="ml-1">文本切片</a-tag>
              </span>
              <a-tag color="cyan" class="font-mono font-bold">
                相似度: {{ ((item.score || 0) * 100).toFixed(1) }}%
              </a-tag>
            </div>
            <div v-if="item.question" class="text-purple-700 dark:text-purple-300 font-semibold">
              Q: {{ item.question }}
            </div>
            <div class="text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-white dark:bg-zinc-900 p-2 rounded border border-zinc-100 dark:border-zinc-800">
              {{ item.content }}
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
  getKnowledgeBasesApi,
  createKnowledgeBaseApi,
  updateKnowledgeBaseApi,
  deleteKnowledgeBaseApi,
  getKnowledgeChunksApi,
  deleteKnowledgeChunkApi,
  updateKnowledgeChunkApi,
  chunkTextApi,
  searchKnowledgeChunksApi,
  type KnowledgeBase,
  type KnowledgeChunk,
} from '#/api/ai/knowledge';

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

// 页面模式: 'list' (知识库总览) 或 'detail' (知识库片段维护与编辑独立工作台)
const viewMode = ref<'list' | 'detail'>('list');

// 知识库列表表格配置
const columns = [
  { title: '知识库名称', key: 'name', width: 280 },
  { title: '切片规则', key: 'config', width: 180 },
  { title: '状态', key: 'status', width: 100 },
  { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 180 },
  { title: '操作', key: 'action', width: 260, fixed: 'right' },
];

const kbList = ref<KnowledgeBase[]>([]);
const loading = ref(false);
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
});

// 新建/编辑知识库弹窗
const modalVisible = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);
const formData = reactive({
  name: '',
  description: '',
  chunkSize: 500,
  chunkOverlap: 50,
  isPublic: '0',
  status: '0',
});

// 当前正在查看/维护的知识库
const activeKb = ref<KnowledgeBase | null>(null);

// 切片独立页面表格配置
const chunkColumns = [
  { title: '#', key: 'id', width: 60 },
  { title: '类型', key: 'chunkType', width: 110 },
  { title: '标题 / 标准问题 (Q)', key: 'titleOrQuestion', width: 260 },
  { title: '知识正文 / 标准回答 (A)', key: 'content', ellipsis: false },
  { title: '字数', key: 'tokenCount', width: 90 },
  { title: '录入时间', key: 'createTime', width: 160 },
  { title: '操作', key: 'action', width: 130, fixed: 'right' },
];

const chunkList = ref<KnowledgeChunk[]>([]);
const chunkLoading = ref(false);
const chunkFilterType = ref<'all' | 'qa' | 'text'>('all');
const chunkSearchKeyword = ref('');
const chunkPagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
});

// 录入新切片/QA弹窗
const chunkModalVisible = ref(false);
const chunking = ref(false);
const chunkFormData = reactive({
  chunkType: 'qa' as 'qa' | 'text',
  question: '',
  title: '',
  content: '',
});

// 编辑切片/QA弹窗
const editChunkModalVisible = ref(false);
const savingChunk = ref(false);
const editingChunkData = reactive({
  id: 0,
  chunkType: 'qa',
  question: '',
  content: '',
});

// 检索沙盒状态
const searchDrawerVisible = ref(false);
const searchQuery = ref('');
const searchTopK = ref(5);
const searchMinScore = ref(0.3);
const searching = ref(false);
const searched = ref(false);
const searchResults = ref<KnowledgeChunk[]>([]);

onMounted(() => {
  loadData();
});

function formatDateTime(val?: string) {
  if (!val) return '-';
  return val.replace('T', ' ').slice(0, 19);
}

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

// 导航进入知识库片段维护独立页面 (彻底告别抽屉)
function enterDetailPage(record: KnowledgeBase) {
  activeKb.value = record;
  chunkPagination.current = 1;
  chunkFilterType.value = 'all';
  chunkSearchKeyword.value = '';
  viewMode.value = 'detail';
  loadChunks();
}

function backToList() {
  viewMode.value = 'list';
  loadData();
}

function handleFilterChange() {
  chunkPagination.current = 1;
  loadChunks();
}

function handleSearchChunks() {
  chunkPagination.current = 1;
  loadChunks();
}

async function loadChunks() {
  if (!activeKb.value?.id) return;
  chunkLoading.value = true;
  try {
    const res = await getKnowledgeChunksApi(activeKb.value.id, {
      pageNum: chunkPagination.current,
      pageSize: chunkPagination.pageSize,
      chunkType: chunkFilterType.value !== 'all' ? chunkFilterType.value : undefined,
      keyword: chunkSearchKeyword.value.trim() || undefined,
    });
    chunkList.value = res.rows || [];
    chunkPagination.total = res.total || 0;
  } catch (err: any) {
    message.error(err.message || '加载知识明细失败');
  } finally {
    chunkLoading.value = false;
  }
}

function openAddKnowledgeModal(type: 'qa' | 'text' = 'qa') {
  chunkFormData.chunkType = type;
  chunkFormData.question = '';
  chunkFormData.title = '';
  chunkFormData.content = '';
  chunkModalVisible.value = true;
}

// 打开切片/问答词条编辑弹窗
function openEditChunkModal(record: KnowledgeChunk) {
  editingChunkData.id = record.id || 0;
  editingChunkData.chunkType = record.chunkType || 'text';
  editingChunkData.question = record.question || '';
  editingChunkData.content = record.content || '';
  editChunkModalVisible.value = true;
}

async function handleSaveEditChunk() {
  if (!editingChunkData.id) return;
  if (editingChunkData.chunkType === 'qa') {
    if (!editingChunkData.question?.trim()) {
      message.warning('请输入标准问题 (Q)');
      return;
    }
    if (!editingChunkData.content?.trim()) {
      message.warning('请输入标准回答 (A)');
      return;
    }
  } else {
    if (!editingChunkData.content?.trim()) {
      message.warning('请输入切片正文文本');
      return;
    }
  }

  savingChunk.value = true;
  try {
    await updateKnowledgeChunkApi({
      id: editingChunkData.id,
      question: editingChunkData.question.trim(),
      content: editingChunkData.content.trim(),
      chunkType: editingChunkData.chunkType,
    });
    message.success('知识片段已成功更新并重新计算向量入库');
    editChunkModalVisible.value = false;
    loadChunks();
  } catch (err: any) {
    message.error(err.message || '更新知识切片失败');
  } finally {
    savingChunk.value = false;
  }
}

async function handleDoChunk() {
  if (!activeKb.value?.id) {
    message.error('未绑定有效知识库');
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
