# 个人 AI 助手 (Personal AI Assistant)

本项目是一套完整的端到端 AI 知识库与智能助手系统，融合了移动端原生应用、RuoYi-Vue-Plus 企业级后端中枢、ruoyi-plus-vben5 管理后台以及向量知识库 (pgvector)。

## 项目全景架构

```
assistant_handoff/
├── RuoYi-Vue-Plus/       # 企业级业务中枢与 AI 引擎 (Java 21 / Spring Boot 3 / PostgreSQL 16 + pgvector)
│   ├── ruoyi-admin/      # 系统主启动模块与环境配置
│   └── ruoyi-modules/    # 核心业务模块 (ruoyi-ai 流式对话/知识库切片/向量检索等)
├── ruoyi-plus-vben5/     # AI 运营与知识库管理后台 (Vue 3 / Ant Design Vue / Vben 5 Monorepo)
│   └── apps/web-antd/    # AI 对话工作台、模型热配置与知识切片管理
├── apps/
│   ├── mobile/           # 移动端原生应用 (Tauri 2 + React 19 + TailwindCSS)
│   └── server/           # 轻量级辅助业务网关与 MCP Bridge (Fastify + SQLite)
├── packages/             # 共享跨端核心库 (contracts, core, mcp-bridge, rag-engine)
└── AI_ASSISTANT_ROADMAP.md # AI 助手与 RAG 检索增强系统实施规划与落地路线图

```

## 核心特性
- **双端协同**: 提供 Web 运营管理端 (ruoyi-plus-vben5) 与移动端原生 App (Tauri 2 Android/iOS)。
- **AI 业务中枢**: 基于 RuoYi-Vue-Plus + Sa-Token 统一多端鉴权，支持 SSE 打字机流式输出与双向落库。
- **纯私有部署**: 后端与 MCP 运行在自己的服务器，手机不直连中转站，不暴露敏感密钥。
- **iOS 风格卡片**: 浅灰底色、高对比度白色卡片、席别价格分化、跨日行程标识。
- **安全隔离**: 彻底屏蔽 Pi 的终端执行与通用文件读写能力（`noTools: "builtin"`），仅开放受控业务工具。
- **防崩溃与容错**: 规避大模型长 JSON 输出引发的 `content_filter`；上游报错时保留结构化车票卡片。
- **可恢复流**: 采用 SSE + seq 游标序列机制，断网重连不丢失历史和当前查询。

## 统一脚本入口

```bash
# 安装依赖
pnpm install

# 运行后端开发环境 (Fastify)
pnpm dev:server

# 运行前端开发环境 (Vite + React)
pnpm dev:mobile

# 执行全部测试 (单元测试 + 集成测试)
pnpm test

# 生成设备一次性配对码
pnpm device:pair

# 撤销设备授权
pnpm device:revoke <deviceId>

# 数据库在线热备份
pnpm backup

# 生产环境打包
pnpm build
```

## 交付文档
- 部署说明：`DEPLOYMENT.md`
- 备份恢复说明：`BACKUP_RESTORE.md`
- 实施记录与限制：`KNOWN_LIMITATIONS.md`、`docs/PROGRESS.md`
