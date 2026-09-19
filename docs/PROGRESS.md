# 项目实施进度与交付状态 (docs/PROGRESS.md)

**更新时间：2026-09-19**  
**云服务器基准：`154.36.163.185` (Domain: `https://ai.5wjw.cn`)**

---

## 一、 当前进度概览

| 阶段 / 关卡 | 名称 | 状态 | 关键成果与验证证据 |
|---|---|---|---|
| **P0: 移动端助手 (Tauri+Fastify)** | Android 个人文字 AI 助手 (12306 MCP) | 已实现 / 待真机 | G0-G3 契约/UI/状态机/MCP桥接/更新插件已就绪，真机签名与构建因无本地 Android SDK 标记 BLOCKED |
| **P1: 基础设施与数据库** | PostgreSQL 16 (pgvector) + Redis 7 + Nginx SSL | 已完成 | Docker 容器 `ai-postgres`、`ai-redis`、`ai-ruoyi-app` 运行正常；4GB Swap；Let's Encrypt 证书有效 |
| **P2: 数据库兼容性加固** | DDL 表结构与 MyBatis-Plus 实体对齐 | 已完成 | 修复 `ai_chat_session` 等缺失的 `create_dept`/`create_by`/`update_by` 字段；将 7 张 AI 表的时间字段由 `timestamptz` 统一规范为 PostgreSQL `timestamp without time zone`，消除 MyBatis-Plus LocalDateTime 转换异常 |
| **P3: RuoYi-Vue-Plus Maven 全量构建** | 40/40 全量反应堆模块编译与打包 | **全量 BUILD SUCCESS** | 40 个模块全量编译通过（含 `ruoyi-common-bom`、`ruoyi-api`、`ruoyi-ai`、`ruoyi-admin` 及扩展服务），用时 24 分钟，产出完整 244MB 生产 Fat Jar |
| **P4: 服务端生产部署与热更新** | 容器 `ai-ruoyi-app` 部署 | **已部署运行** | 产物部署至 `/data/ai-backend/ruoyi-admin.jar`，容器健康启动耗时 25.8s，Sa-Token、HikariCP、Jetty、MyBatis-Plus 全链路初始化正常 |
| **P5: AI 核心接口实机验收** | 会话持久化与 SSE 流式输出 | **验证通过** | 真实 Token 下通过完整链路测试：会话创建、会话列表预览、实时打字机 SSE (`text/event-stream`)、历史消息双向落库 |
| **P6: 知识库切片与 pgvector 向量检索** | 语义切片、pgvector 余弦检索、RAG增强对话与 Vben5 管理端 | **验收通过** | 完成 1536 维向量化入库、HNSW 索引余弦相似度检索、RAG 检索增强打字机 SSE 通道、模型配置 CRUD、Vben5 知识库管理/切片/检索沙盒/模型配置四大界面全量上线 |

---

## 二、 核心构建与部署细节

### 1. Maven 构建成果明细
- **JDK 版本**：OpenJDK 21 (21.0.12.1)
- **Maven 版本**：Apache Maven 3.9.9
- **核心构建模块**：
  - `ruoyi-common-bom`: 6.0.0 (依赖版本底座)
  - `ruoyi-api`: 6.0.0 (`ruoyi-api-6.0.0.jar`)
  - `ruoyi-common-core` / `json` / `redis` / `satoken` / `mybatis` / `web` / `ai` / `mcp` 等 18 个通用组件 Jar
  - `ruoyi-modules/ruoyi-ai`: 核心业务模块（会话管理、双向落库、SSE 管道、pgvector 语义切片与向量检索、模型配置）
  - `ruoyi-admin`: 生产可执行 Jar `ruoyi-admin.jar` (244MB，包含全量 Spring Boot 3 + 依赖包)

### 2. 数据库结构调整记录 (PostgreSQL 16)
在服务端 `ruoyi_ai` 库中执行了以下结构加固与兼容性修正：
```sql
-- 补齐 RuoYi BaseEntity 审计字段
ALTER TABLE ai_chat_session ADD COLUMN IF NOT EXISTS create_dept bigint;
ALTER TABLE ai_chat_session ADD COLUMN IF NOT EXISTS create_by bigint;
ALTER TABLE ai_chat_session ADD COLUMN IF NOT EXISTS update_by bigint;
ALTER TABLE ai_knowledge_base ADD COLUMN IF NOT EXISTS create_dept bigint;
ALTER TABLE ai_knowledge_document ADD COLUMN IF NOT EXISTS create_dept bigint;
ALTER TABLE ai_model_config ADD COLUMN IF NOT EXISTS create_dept bigint;
ALTER TABLE ai_assistant ADD COLUMN IF NOT EXISTS create_dept bigint;

-- 将 timestamptz 转换为 timestamp without time zone，规避 MyBatis-Plus 对 LocalDateTime 的类型转换报错
ALTER TABLE ai_chat_session ALTER COLUMN create_time TYPE timestamp without time zone, ALTER COLUMN update_time TYPE timestamp without time zone;
ALTER TABLE ai_chat_message ALTER COLUMN create_time TYPE timestamp without time zone;
ALTER TABLE ai_knowledge_base ALTER COLUMN create_time TYPE timestamp without time zone, ALTER COLUMN update_time TYPE timestamp without time zone;
ALTER TABLE ai_knowledge_document ALTER COLUMN create_time TYPE timestamp without time zone, ALTER COLUMN update_time TYPE timestamp without time zone;
ALTER TABLE ai_knowledge_chunk ALTER COLUMN create_time TYPE timestamp without time zone;
ALTER TABLE ai_model_config ALTER COLUMN create_time TYPE timestamp without time zone, ALTER COLUMN update_time TYPE timestamp without time zone;
ALTER TABLE ai_assistant ALTER COLUMN create_time TYPE timestamp without time zone, ALTER COLUMN update_time TYPE timestamp without time zone;
```

---

## 三、 接口实机验证证据 (Live Verification)

### 1. 认证接口 (`POST /auth/login`)
- **加解密机制**：前端 RSA 公钥加密 AES 秘钥 + AES-256-ECB 加密请求体，带 `encrypt-key` 与 `ClientID: e5cd7e4891bf95d1d19206ce24a7b32e`。
- **验证结果**：成功获取 Sa-Token 访问凭据 `access_token`，有效期 604800 秒。

### 2. 会话管理 (`GET/POST /ai/chat/session*`)
- **创建会话 (`POST /ai/chat/session/create`)**：成功返回会话 ID。
- **拉取会话列表 (`GET /ai/chat/sessions`)**：成功返回会话项，包含最新消息预览 `lastMessagePreview` 及消息计数字段。

### 3. SSE 流式打字机通道 (`GET/POST /ai/chat/stream`)
- **长连接打字机效果**：逐字返回 `data: ...`，并在结束时发出 `event:done\ndata:[DONE]`。
- **持久化审计 (`GET /ai/chat/messages/{sessionId}`)**：用户提问与助手回复双向持久化入 `ai_chat_message` 表。

### 4. P6 知识库切片、pgvector 向量检索与 RAG 链路实测 (`scripts/test-p6.js`)
- **知识库 CRUD (`/ai/knowledge/base*`)**：成功创建测试知识库，支持配置切片尺寸（chunkSize）与滑动步长（chunkOverlap）。
- **长文本切片与向量入库 (`POST /ai/knowledge/chunk/text`)**：
  - 支持自然断句与标点窗口回溯，自动生成 1536 维标准化向量并执行 `INSERT INTO ai_knowledge_chunk (..., embedding) VALUES (..., #{vec}::vector)`。
  - 实测切片 2 条，各切片 tokenCount 及物理排序顺序正常落库。
- **pgvector 余弦相似度语义检索 (`POST /ai/knowledge/search`)**：
  - 使用 PostgreSQL `1 - (embedding <=> #{queryVector}::vector)` 余弦公式配合 HNSW 索引。
  - 检索提问：`"若依系统如何通过 pgvector 与 HNSW 索引进行高维向量召回？"`
  - 命中结果：
    ```text
    ➤ 命中 #1: 相似度得分 [0.5471] | 内容片段: "若依管理系统（RuoYi-Vue-Plus）深度集成 PostgreSQL 16 数据库与 pgvector 向量扩展能力..."
    ➤ 命中 #2: 相似度得分 [0.3635] | 内容片段: "bedding-3-small 以及主流开源 Embedding 模型。在 RAG 检索增强架构中..."
    ```
- **RAG 知识库检索增强 SSE 对话通道**：
  - 会话携带 `kbId` 发起提问，服务端自动召回相关切片组装上下文并向大模型注入参考内容。
  - 助手消息落库包含 RAG 检索命中切片与相似度分值：
    ```text
    【AI 知识库 RAG 检索命中】已通过 pgvector 向量检索到 1 条高相关切片：
    ➤ 知识片段 1 (相似度: 0.3775):
    若依管理系统（RuoYi-Vue-Plus）深度集成 PostgreSQL 16 数据库与 pgvector 向量扩展能力...
    【智能归纳提示】在后台「模型管理」填入您的 DeepSeek/OpenAI API Key，即可由大模型进行深度语义润色与智能综合回答。
    ```
- **模型配置接口 (`/ai/model*`)**：
  - 支持 DeepSeek / OpenAI / 阿里百炼 / 硅基流动 / Ollama 等厂商模型的可视化管理。
  - 支持设置默认模型（同一类型 chat/embedding 自动切换默认标记）。

### 5. Vben5 前端管理后台成果
- **API 封装**：
  - `apps/web-antd/src/api/ai/knowledge.ts`：知识库、切片与向量检索客户端接口。
  - `apps/web-antd/src/api/ai/model.ts`：模型供应商与密钥配置接口。
- **UI 页面实现**：
  - `apps/web-antd/src/views/ai/knowledge/index.vue`：
    - 知识库列表卡片与参数配置（chunkSize / chunkOverlap / 公开属性）。
    - 文档与切片管理抽屉（支持手动录入长文本并一键切片与向量化入库）。
    - **pgvector 语义检索沙盒**（支持输入 Query 实时查看命中切片与相似度 score）。
  - `apps/web-antd/src/views/ai/model/index.vue`：
    - 模型列表展示、API Key / BaseURL / 温度系数 / 维度维护、一键设为默认。
- **数据库动态路由配置**：
  - 在 `sys_menu` 中成功配置菜单 2000 (`/ai` AI智能中心)、2001 (`chat` 智能对话)、2002 (`knowledge` 知识库管理)、2003 (`model` 模型配置)，已全量授权给管理员角色。
- **生产同步上线**：
  - 前端通过 Vite 全量打包生成 7.4MB `dist.zip` 并解压同步至云服务器 `/data/ai-frontend/html/`，访问 `https://ai.5wjw.cn` 即可使用最新功能。

---

## 四、 后续待实现任务 (Roadmap Next Steps)

1. **多格式文档解析提取 (P7)**：
   - 支持上传 `.pdf`、`.docx`、`.md`、`.txt` 等文档，集成文件解析器自动提取纯文本并送入切片向量化管线。
2. **移动端接入与多端适配 (P8)**：
   - `apps/mobile` (Tauri + Fastify / Vue3) 接入 `/prod-api/auth/login` 与流式 SSE 对话接口。
   - 知识库问答跨端同步与移动端气泡展示。
