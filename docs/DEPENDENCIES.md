# 依赖核验报告 (G0 阶段)

## 1. 工具链环境核查

| 工具 / 运行时 | 版本 / 状态 | 备注 |
|---|---|---|
| Node.js | v22.22.0 (LTS 兼容) | 当前系统实际运行版本 |
| pnpm | 11.7.0 | 支持 pnpm workspace |
| Rust / cargo | rustc 1.94.1 / cargo 1.94.1 (aarch64-apple-darwin) | 满足 Tauri 2 编译要求 |
| Java | OpenJDK 25.0.2 LTS | 满足 Android 工具链基础要求 |
| Android SDK/NDK | 未配置环境变量 (ANDROID_HOME 未检测到) | Android 打包阶段标记为 BLOCKED，需后续在构建机配置 SDK |
| @earendil-works/pi-coding-agent | 0.84.2 | 全局与本地已验证导出 API |
| 12306-mcp 基线提交 | `ff6439da6f63d7d72181abea4568abd69878c600` | 锁定来自 JWJW000/12306-mcp |

## 2. 依赖锁定决策

- Workspace 管理器: pnpm
- 基础语言: TypeScript 5.7+
- 后端技术栈: Fastify 5.x, better-sqlite3 / Drizzle ORM, Zod
- Agent 核心: `@earendil-works/pi-coding-agent` (0.84.2), 自定义 AgentRuntime 适配层，受控禁用内置 shell/文件工具 (`noTools: "builtin"`)
- MCP 客户端: `@modelcontextprotocol/sdk` (stdio transport)
- 移动端/前端: Vite 6.x, React 19 / 18, Konsta UI (iOS theme), assistant-ui (ExternalStoreRuntime), Tailwind CSS, Tauri 2 CLI
