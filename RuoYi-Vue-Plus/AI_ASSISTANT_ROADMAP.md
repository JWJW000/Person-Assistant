# AI 知识库助手项目实施规划与开发进展 (AI Assistant & RAG Roadmap)

本项目基于 **RuoYi-Vue-Plus** (后端底座) + **ruoyi-plus-vben5** (后台管理前端) + **PostgreSQL 16 (pgvector)** 打造个人/企业专属 AI 知识库与多端助手应用。

---

## 一、 当前系统架构与服务拓扑

```
+-----------------------------------------------------------------------------------+
|                                  客户端展现层                                       |
|  [ Web后台 (ruoyi-plus-vben5) ]        [ 移动端 App (Uni-app / 原生) ]              |
|  - 知识库与切片可视化管理                - 统一登录 (复用若依 Token)                        |
|  - 模型配置与调用审计                   - 沉浸式流式对话 (SSE) / 知识溯源展示               |
+------------------------------------------+----------------------------------------+
                                           | HTTPS / RESTful / SSE (长连接)
                                           v
+-----------------------------------------------------------------------------------+
|                         业务中枢层: RuoYi-Vue-Plus 后端                             |
|  - 统一认证与鉴权 (Sa-Token: Web/App 多端多设备支持)                              |
|  - AI 业务模块 (ruoyi-ai): 模型管理、会话双向持久化、知识库切片、SSE流式响应管道     |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                                  数据与模型基础设施                                 |
|  - PostgreSQL 16 + pgvector: 业务主库 + 1536维 HNSW 余弦向量库 + 全文检索         |
|  - Redis 7: 分布式会话缓存与限流                                                  |
|  - 云端大模型: DeepSeek / OpenAI / 通义千问 / 本地 Ollama 兼容协议               |
+-----------------------------------------------------------------------------------+
```

---

## 二、 已完成落地成果 (Completed)

### 1. 服务器与基础设施 (Server: 154.36.163.185)
- [x] **4GB 虚拟内存 (Swap) 扩容**：防止 Java 21 + 向量数据库 + Redis 高并发 OOM。
- [x] **PostgreSQL 16 + pgvector 部署**：
  - 容器名：`ai-postgres`
  - 激活核心扩展：`vector (0.8.6)` 向量扩展、`pg_trgm (1.6)` 模糊文本匹配。
- [x] **Redis 7 部署**：容器名：`ai-redis`，支持 Sa-Token 分布式多端鉴权。
- [x] **域名绑定与自动化 SSL**：
  - 域名：`https://ai.5wjw.cn`
  - 通过 Certbot 配置 Let's Encrypt 证书并启用自动续期任务。
  - Nginx 配置完成：支持前端 HTML5 History 路由、`/prod-api/` 及 `/api/` 动态重写反向代理、关闭代理缓冲（开启 SSE 打字机流式透传）。

### 2. 数据库设计与建表 (DDL)
已在 `ruoyi_ai` 数据库中创建并测试通过 7 张 AI 核心业务表：
- [x] `ai_model_config`：大模型与嵌入模型热插拔配置（DeepSeek/OpenAI/Ollama 等）。
- [x] `ai_knowledge_base`：多知识库隔离主表（切片大小、重叠字数配置）。
- [x] `ai_knowledge_document`：文档生命周期与解析状态表。
- [x] `ai_knowledge_chunk`：**知识切片与向量表**（包含 1536 维 `vector` 字段，已构建 **HNSW 向量余弦索引**与 **GIN Trigram 文本检索索引**）。
- [x] `ai_assistant`：AI 助手/角色/智能体预设表。
- [x] `ai_chat_session`：会话主表（标题自动更新、最后消息预览、置顶管理）。
- [x] `ai_chat_message`：消息详情表（支持用户与助手**双向实时落库**、响应耗时、Token 消耗审计、`citations` 引用溯源）。
- [x] 若依系统底座表全量初始化并完成 PostgreSQL 兼容改造。
- [x] 在 `sys_menu` 中注册“AI 智能中心”与“智能对话与知识库”菜单并授权超管。

### 3. 后端服务 (RuoYi-Vue-Plus 6.0.0)
- [x] 数据源切换为 PostgreSQL 驱动 (`org.postgresql.Driver`)。
- [x] 在 `ruoyi-modules/ruoyi-ai` 中实现：
  - ORM 实体层：`AiChatSession`、`AiChatMessage`、`AiKnowledgeBase`、`AiModelConfig`
  - 持久层 Mapper：`AiChatSessionMapper`、`AiChatMessageMapper` 等
  - 核心业务层：`IAiChatService` / `AiChatServiceImpl`
  - 控制器接口：
    - `GET /ai/chat/sessions`：获取用户历史会话列表。
    - `POST /ai/chat/session/create`：新建对话会话。
    - `DELETE /ai/chat/session/{sessionId}`：删除会话。
    - `GET /ai/chat/messages/{sessionId}`：获取会话历史消息记录。
    - `GET/POST /ai/chat/stream`：**SSE (`text/event-stream`) 打字机流式对话接口**，异步调度模型，并自动完成提问与回复的双向入库。
- [x] 后端 35 个微服务/模块通过 Maven 构建打包，制作成精简生产容器 `ai-ruoyi-app` 部署运行。

### 4. 前台管理端 (ruoyi-plus-vben5)
- [x] Monorepo 依赖安装与构建流程打通。
- [x] 新增 AI 对话工作台：`apps/web-antd/src/views/ai/chat/index.vue`。
- [x] 新增 AI API 客户端层：`apps/web-antd/src/api/ai/chat.ts`。
- [x] 登录页面异常修复：捕获未开启多租户时的 404 异常，回退单租户模式激活登录提交按钮。
- [x] 跨环境秘钥对齐：将后端实际使用的 RSA 加密解密秘钥完整同步至前端 `.env.production`，确保 `@ApiEncrypt` 正常登录。
- [x] 前端全量打包并同步部署到生产服务器 Nginx 托管。

---

## 三、 待实现功能清单 (Todo Roadmap)

```
┌────────────────────────────────────────────────────────┐
│ 阶段一：真实大模型与 RAG 检索增强闭环（当前最优先）        │
├────────────────────────────────────────────────────────┤
│ 1. 真实大模型 Key 配置与热切换                         │
│ 2. 文档上传与解析提取 (集成 Apache Tika)                │
│ 3. 文本语义切片与向量化计算 (Embedding API -> pgvector) │
│ 4. 混合检索召回 (Vector Top-K + Keyword + Prompt 拼装) │
└────────────────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────┐
│ 阶段二：Vben5 管理后台功能页面完整化                    │
├────────────────────────────────────────────────────────┤
│ 1. 知识库管理面板 (创建知识库、配置切片参数与检索策略)    │
│ 2. 文档管理与切片查看器 (查看 Chunk、手动增删改查切片)  │
│ 3. 检索沙盒调试器 (输入 Query 实时查看命中切片与分值)    │
│ 4. 模型管理页面 (可视化配置 DeepSeek / OpenAI / Ollama) │
│ 5. 角色与助手 Agent 配置页 (System Prompt / 欢迎语)     │
└────────────────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────┐
│ 阶段三：移动端 App 接入与多端适配                       │
├────────────────────────────────────────────────────────┤
│ 1. 移动端 App 工程初始化 (Uni-app Vue3 / 原生)          │
│ 2. 统一鉴权对接 (/prod-api/auth/login 获取 Token)       │
│ 3. 移动端 SSE 流式长连接通讯与打字机气泡                │
│ 4. Markdown 富文本渲染与代码块复制                     │
│ 5. App 与 Web 对话历史实时双向同步                     │
└────────────────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────┐
│ 阶段四：安全加固与生产运维运维                         │
├────────────────────────────────────────────────────────┤
│ 1. 会话滑动窗口与历史对话自动摘要压缩 (避免超出上下文)    │
│ 2. 知识库引用来源气泡 (Citations 点击跳转查看源文档)     │
│ 3. Token 消耗统计与用户调用额度控制                    │
│ 4. PostgreSQL 向量数据与 Redis 自动化定期备份脚本       │
└────────────────────────────────────────────────────────┘
```

---

## 四、 详细待实现模块拆解

### 1. 知识库构建与 RAG 管道 (核心技术点)
- **文档解析**：在 `ruoyi-ai` 中集成 `org.apache.tika:tika-core`，用户上传 `.pdf`、`.docx`、`.md`、`.txt` 后自动抽取纯文本正文。
- **切分流水线**：根据知识库设定的 `chunk_size`（如 500 字）和 `chunk_overlap`（如 50 字重叠）将长文档切分成独立片段。
- **Embedding 向量化**：调用模型 API（OpenAI `text-embedding-3-small` 或国产 BGE/智谱等），生成 1536 维浮点向量存入 `ai_knowledge_chunk.embedding`。
- **余弦检索召回**：
  ```sql
  SELECT id, doc_id, content, 1 - (embedding <=> :queryVector) AS score
  FROM ai_knowledge_chunk
  WHERE kb_id = :kbId AND status = '0'
  ORDER BY embedding <=> :queryVector ASC
  LIMIT :topK;
  ```
- **Prompt 组装**：将召回的前 K 个切片作为参考事实拼装进 System Prompt，送入大模型流式输出。

### 2. Vben5 管理端拓展页面
- **模型配置页 (`/ai/model`)**：增删改查模型配置（供应商、模型代码、API Key、BaseUrl、最大 Token、温度系数、一键切换默认）。
- **知识库管理与文档上传 (`/ai/knowledge`)**：卡片式知识库列表、文档批量拖拽上传、解析进度条、切片可视化微调。
- **召回命中测试器**：提供调试沙盒，输入测试问题即可查看匹配到的文本切片与相似度分数。

### 3. 移动端 App 对接协议规范
- **客户端凭证**：使用已预置的 `client_id: 428a8310cd442757ae699df5d894f051`。
- **登录接口**：`POST https://ai.5wjw.cn/prod-api/auth/login`
- **鉴权 Header**：`Authorization: Bearer <token>`
- **会话与流式**：
  - 拉取列表：`GET https://ai.5wjw.cn/prod-api/ai/chat/sessions`
  - 流式 SSE：`GET/POST https://ai.5wjw.cn/prod-api/ai/chat/stream?sessionId=xxx&message=xxx`
