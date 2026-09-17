# 兼容性与基线验证报告 (G0 COMPATIBILITY REPORT)

## 1. 验证目标
核对 Pi SDK (0.84.2) 接口与 12306-mcp 数据格式，确保无内置文件/命令泄漏风险，并验证错误解析规则。

## 2. Pi SDK 关键能力验证
- 包名: `@earendil-works/pi-coding-agent`
- 自定义工具注入支持: 支持自定义 tool 定义与回调
- 内置工具屏蔽: 支持 `noTools: "builtin"` 配置，屏蔽 read, bash, edit, write 工具
- 远程模型协议支持: `openai-completions`, `openai-responses`, `anthropic-messages`

## 3. 12306-mcp 数据适配事实
- 锁定 Commit: `ff6439da6f63d7d72181abea4568abd69878c600`
- 数据格式特征:
  1. `get-tickets` 调用传参 `{ format: "json" }`，返回依然包裹在 `content[].text` 内。
  2. 失败分支或验证码/风控分支可能直接在 `content[].text` 中返回 `Error: ...` 文本，`isError` 可能不为 true。
  3. 车票字段包含: `train_no`, `start_train_code`, `from_station_name`, `to_station_name`, `start_time`, `arrive_time`, `lishi`, `prices` 等。
  4. 价格单位需归一化为整数分 (Minor Currency CNY)。
  5. 状态映射必须区分: `available`, `sold_out`, `waitlist`, `not_applicable`, `unknown`。

## 4. 当前状态与阻塞项
- [PASS] Node / pnpm / Rust / Pi SDK 本地环境核查。
- [PASS] 12306-mcp 规范核验。
- [BLOCKED] 用户个人中转站真实端点与密钥 (无真实凭证，进入占位与模拟测试)。
- [BLOCKED] Android 物理机真机构建 (当前开发环境缺少 ANDROID_HOME / NDK)。
