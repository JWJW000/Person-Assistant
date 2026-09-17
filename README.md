# 个人 AI 助手 (Android v0.1)

基于 **Tauri 2 + React 19 + Fastify + SQLite + Pi SDK + 12306 MCP** 的个人自用火车票智能助手。

## 核心特性
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
