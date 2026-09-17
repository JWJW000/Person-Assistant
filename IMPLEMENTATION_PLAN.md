# Android 个人 AI 助手：v0.1 实施方案

**文档版本：1.0｜编制日期：2026-09-16｜用途：交付编码智能体实施**

**目标架构：Tauri + React + Konsta UI + assistant-ui + TypeScript 后端 + Pi SDK + 12306 MCP。**

这是一份产品范围、工程架构和验收契约合一的实施规格，不是已经完成的应用。本文不包含真实密钥、服务器登录信息或实时车票数据。用户的中转站、服务器和 Android 真机尚未在本次文档编制中实际连接；相关结果必须由实施者测试后记录，不能标记为已通过。

文中“必须”是 v0.1 验收要求，“默认”是允许通过配置调整的方案，“后续”明确不在本版实现。除已引用的依赖能力和仓库代码事实外，接口、数据库、阈值及目录均是本项目的设计约定，不是第三方 SDK 原生接口。

## 00. 编码智能体先读：任务边界与执行规则

**交付目标：一个可安装到 Android 手机的个人文字 AI 助手，能够经由用户中转站调用 Pi，再调用真实 12306 MCP，以 iOS 风格卡片展示结果。**

先读取本文件及 `START_HERE.md`。如工作区已有代码，先检查目录、依赖、未提交变更和现有测试；不得覆盖用户文件、强制推送、清空数据库或未经授权部署。

按 G0 → G1 → G2 → G3 → G4 → G5 → G6 的关卡实施。缺少真实中转站配置时，继续完成契约、假服务测试和 UI，但把真实联调标记为 BLOCKED；不得用演示数据充当真实查询成功。未经同意，不替换技术栈、不加入额外 Agent 框架、不新增首版之外的产品功能。

每一关都更新 `docs/PROGRESS.md`：完成项、变更文件、执行命令、真实测试结果、未完成项和下一步。不要仅写“应该可以运行”。文档中的脚本名称是要求项目提供的入口，编码智能体要先实现它们，不能假定它们已经存在。

最终交付源代码、依赖锁文件、迁移脚本、测试、配置样例、部署/备份/恢复说明，以及具备签名条件时的 APK。没有签名密钥时交付 debug APK 和 release 签名步骤，明确标识，不能声称发布包已经完成。

### 阅读路线

| 实施角色 | 优先阅读 |
| --- | --- |
| 主编码智能体 | 00—03、15—17；然后按关卡阅读对应章节 |
| 后端/Agent | 05—12；重点是工具隔离、结果归一化和执行恢复 |
| 前端/Android | 04、08、10—12；重点是卡片、状态、鉴权与真机 |
| 测试/交付 | 13—18；按编号保留测试证据 |

## 01. 已确定的产品范围

### 1.1 用户已经确认的条件

| 事项 | 决策 |
| --- | --- |
| 用户与平台 | 个人自用、单用户；Android 优先，只做一个手机平台 |
| 视觉 | 接近 iOS 的浅灰背景、白色分组卡片、大标题、蓝色主操作 |
| 输入 | 只做文字；不申请录音、相机、定位、通讯录权限 |
| 模型 | 用户自己的中转站；地址、协议、模型和密钥可配置 |
| 部署 | 用户自己的服务器；不把模型与 MCP 进程放进手机 |
| 首个外部能力 | 用户仓库 JWJW000/12306-mcp |
| 主要交互 | 对话 + 结构化结果卡片 + 可修改条件 + 执行记录 |

### 1.2 必须实现与明确排除

**必须实现：**设备配对、普通文字对话、流式显示、查票、精确筛选、车票卡片、经停站详情、连续对话修改条件、收藏查询、历史恢复、显式偏好、失败/取消/断线状态、模型与 MCP 自检。

**不实现：**自动购票、支付、抢票、候补提交、持续盯票、定时任务、远程推送、语音、图片、文件上传、NAS、SSH、任意命令、任意文件操作、插件市场、多 Agent、RAG/向量库、商店上架、内置自动更新。

“任务”页面首版仅表示单次执行记录，不出现“后台监控中”或“已为你持续关注”按钮和文案。中转查询是后续能力：底层即便存在，也不因此进入首版验收。

### 1.3 核心用户故事

用户输入查票需求，看到实际查询范围和时间；修改条件不必重输城市与日期；收藏的是条件与历史快照；退出重进能够找回结果；刷新才产生新的查询。接口失败时明确失败，不被解释为无票。

## 02. 技术选择与兼容性核验

### 2.1 本版固定选型

| 层次 | 方案及责任 |
| --- | --- |
| 手机壳 | Tauri 2；Rust 只做必要桥接，凭据能力用窄接口原生插件 |
| 前端 | React + TypeScript + Vite；Konsta UI iOS 主题；Tailwind |
| 聊天 | assistant-ui 无样式组件 + ExternalStoreRuntime；不接其云服务 |
| 前端状态 | Zustand 管理瞬时状态；服务端数据与缓存由明确的数据层管理 |
| 后端 | Node.js + TypeScript + Fastify；单实例、模块化单体 |
| Agent | Pi coding-agent SDK；只通过自有 AgentRuntime 适配器使用 |
| MCP | 官方 TypeScript SDK；自建受控薄桥接，首版使用 stdio |
| 数据库 | SQLite + Drizzle；单服务器本地持久卷，不放 NAS/SMB |
| 测试 | Vitest、前端组件测试、Playwright Web 测试；Android 真机另验 |
| 工程与部署 | pnpm workspace；Docker Compose 部署后端；已有反代提供 HTTPS |

选择 SQLite 是单用户单实例场景下的工程默认，不代表用户服务器已经安装数据库。暂不引入 Redis、消息队列、Kubernetes 或另一套 Java 后端。以后需要多实例再迁移，不为未来预建分布式系统。

### 2.2 已核验的依赖事实

Tauri 2 提供 Android 开发与签名流程；其移动端 Shell 不能照搬桌面的子进程启动方式。因此 Pi 与 Node MCP 均放在服务器。[S01][S02][S03]

Konsta 可显式设为 `theme="ios"`；assistant-ui 的 ExternalStoreRuntime 可连接应用自有消息状态。两者负责不同层，不混入第二套组件视觉体系。[S04][S05]

Pi 官方 SDK 当前使用 `@earendil-works/pi-coding-agent`。其文档提供自定义工具、事件、会话及禁用默认内置工具能力；模型配置提供自定义地址与协议。Pi 不是安全沙箱，宿主必须自己限制权限。[S06][S07][S08]

官方 MCP TypeScript SDK 提供客户端和本地/远程传输。第一版桥接只使用明确的查询工具，不动态加载任意 MCP 地址或脚本。[S09]

### 2.3 依赖锁定规则

G0 核对各包 engines、peerDependencies 和实际导出，选一个共同支持、仍受维护的 Node LTS；优先评估 Node 24，但以安装和编译结果为准。记录 Node、pnpm、Rust、Java、Android SDK/NDK、Pi、MCP、React、Konsta、assistant-ui 的实际版本。

提交 `pnpm-lock.yaml`、`Cargo.lock`、`.node-version`、`packageManager` 和 `docs/DEPENDENCIES.md`。主依赖固定版本，构建使用冻结锁文件。不要用文档中的“latest”作为生产版本，也不要混用旧 Pi 包名和新 API 示例。

## 03. 系统架构与工程目录

### 3.1 请求链路

```text
Android / Tauri / React
  ├─ Konsta 页面、assistant-ui、业务卡片
  └─ App API Client：HTTPS + Bearer + 可恢复事件流
                |
                v
Fastify 后端（单实例）
  ├─ Auth / Conversations / Runs / Favorites / Settings
  ├─ SQLite：消息、事件、结果、授权与配置
  └─ AgentRuntime（自有接口）
       └─ Pi SDK -> 用户中转站
            └─ 业务工具 -> TrainService -> MCP Client
                          -> 固定版本 12306 MCP -> 上游查询
```

手机不直连中转站，不持有其中转站密钥，不直接启动 MCP。MCP 的 stdout 只承载协议，stderr 进入脱敏日志。反代只公开助手 API，不公开 MCP、SQLite 或 Pi 的工作目录。

### 3.2 建议目录

```text
personal-assistant/
  apps/mobile/              # Vite + React + src-tauri
  apps/server/              # Fastify、鉴权、运行管理
  packages/contracts/      # API / 事件 / 卡片 Zod schemas
  packages/agent-runtime/  # Pi 适配与模型配置
  packages/mcp-bridge/     # MCP 生命周期、调用、归一化
  packages/train-domain/  # 条件、站点、筛选与映射
  packages/ui/            # 设计变量和业务组件
  plugins/device-vault/   # Android Keystore 窄接口
  tests/fixtures/         # 明确标记的测试数据
  tests/integration/
  deploy/                # Dockerfile、Compose、反代样例
  scripts/               # 自检、配对、备份、恢复
  docs/                  # 进度、架构决策、操作手册
```

### 3.3 模块边界

`contracts` 不依赖 Pi、React 或数据库。前端不得读取 Pi 内部事件类型；Pi 升级只改 AgentRuntime。TrainService 可被 AI 工具和表单查询复用，不能复制两套查票逻辑。收藏、偏好是本地业务服务，不强制包装为 MCP。

生产的 MCP 二进制在镜像构建时准备；启动时执行固定路径的 Node 入口，不执行 `npx -y ...@latest`。新增薄桥接是收敛原方案，不是再引入一个 Agent 框架。

## 04. UI 与 Android 交互规格

### 4.1 页面与状态

| 页面 | 必须具备的内容和行为 |
| --- | --- |
| 配对/引导 | HTTPS 地址、配对码、连接测试；显示配置缺失，不自动跳过 |
| 助理首页 | 大标题、最近会话、查票入口；空态不制造虚假统计 |
| 对话详情 | 返回、消息、输入框、发送/停止、真实工具状态与结果卡片 |
| 筛选底部弹层 | 日期、城市/车站、出发时间、席别、排序；应用和取消 |
| 任务 | 单次执行列表和详情；来源、更新时间、失败原因和重试 |
| 资料 | 收藏条件、快照、个人偏好；刷新/删除/编辑入口 |
| 设置 | 设备连接、模型配置、自检、MCP 状态、主题、数据管理 |

主导航为“助理 / 任务 / 资料 / 设置”。进入对话详情后隐藏主导航，留出键盘和输入区域。默认跟随系统明暗，也可手动选择。

### 4.2 视觉约定（本项目默认值）

浅色背景 `#F2F2F7`，卡片白色，强调蓝 `#007AFF`；深色采用近黑背景和深灰卡片。卡片圆角约 20 CSS px、内边距 16、间距 12。正文约 16—17 px，标题约 30—32 px；真实可点区域目标不小于 48 CSS px，并在设备缩放后验证。

使用系统中文字体和统一线性图标；不绑定 Apple 专有图标字体。状态必须同时用文字区分，不只依靠颜色。大面积内容卡片保持不透明，不堆叠玻璃和重阴影。上述参数是产品设计，不是声称符合某一认证标准。

### 4.3 业务组件

`TicketCard` 展示车次、站点、完整出发/到达日期与时间、历时、席别、余票、可用票价、详情与收藏。跨日必须标出。`QuerySummary` 展示条件、站点范围、时间和完整/部分覆盖；`ToolStatus`、`ErrorCard`、`LocationChoiceCard`、`RunDetail`、`PreferenceNotice` 独立封装。

只渲染预定义组件和经过清洗的 Markdown，关闭原始 HTML。不得执行模型或 MCP 返回的 JS/HTML。工具名、状态和卡片元数据来自后端，不从模型文字中正则猜取。

### 4.4 手机专项行为

键盘出现后输入框与发送按钮可见；不依赖桌面固定高度。返回事件由焦点与弹层协调：IME 自己处理键盘关闭，App 不重复消费同一事件；弹层关闭后才退路由。页面草稿和滚动位置按会话保存。

用户已滚离底部时，不因增量输出抢滚动，显示“回到最新”。360/390/430 CSS px 宽度无正文横向溢出；长站名、200% 字号、明暗主题、长对话和安全区域均测试。hover 才出现的操作必须改为点击/常驻入口。

## 05. 查票流程与业务规则

### 5.1 一次查询的完整过程

接收文字 → 创建 run → Pi 理解条件 → 服务端校验日期和位置 → 必要时让用户选择车站范围 → MCP 查询 → 归一化并立即保存结果 → 推送卡片事件 → 模型补充简短解释 → 结束 run。

自然语言和筛选面板必须产生同一份 `TicketQuery`。用户明确要求查票时，只有调用工具成功且保存结果后才能展示真实结果；没有调用工具的回答不能包含编造车次和余票。

### 5.2 日期、时间与地点

铁路业务时区固定 `Asia/Shanghai`；存储事件时间为 UTC，界面明确显示业务日期。不用手机位置推断出发站。当前日期从服务器可信时钟注入，服务端重新计算“明天/后天”；模型提供的日期也要校验。

本对话中的示例“9 月 30 日”明确为 2026-09-30，但正式应用不能硬编码该日期。缺年份且同年日期已过时，要求补全年份，不悄悄跳到下一年。售票窗口和起售时间不能写死；超出可查询范围要根据已验证上游响应说明，未知就显示无法确认。

城市名必须解析为车站集合或经测试确认的上游聚合能力。首版默认最多展开 12 个站对、串行查询；若组合超限，先展示 LocationChoiceCard 让用户缩小范围，不静默截断。默认聚合不是保证上游支持“全城查询”。

每个站对有独立结果状态。全部成功才是 complete；部分失败保留有效结果并标 partial；全部失败就是查询失败。任何列表都必须说明范围，不把“已选站点无结果”扩大为整个城市无车。

### 5.3 筛选和刷新

界面以分钟保存时间区间 `[startMinute,endMinute)`；0—1440，结束大于开始。首版不支持跨午夜出发区间，提示拆分查询。上游时间参数仅作可选预过滤，最终按实际 datetime 精确过滤。

“优先二等座”是偏好排序，不等于“仅二等座有票”；“只看二等座有票”才排除其它状态。到达时间条件单独字段化，按完整到达日期判断，不能只比较钟点。

相同快照内改排序/筛选不重新请求模型和 MCP，标记“基于某时刻结果”。改日期、地点或点击刷新则创建新 run，并关联旧结果；重复条件短期缓存可复用，但必须返回 cache 标识和原始 fetchedAt。

### 5.4 无结果不等于无票

明确区分：成功查询无车次、筛选后无匹配、指定席别售罄、部分覆盖、日期不可查询、上游访问限制、网络失败、数据无法解析。未知状态保持 unknown。遇访问限制停止密集重试，不实现绕过、验证码破解或频繁轮询。

## 06. Pi 运行适配与中转站配置

### 6.1 AgentRuntime 的职责

对应用提供 `startRun / cancelRun / loadCheckpoint / dispose` 等自有接口；把 Pi 的消息与工具事件转换为第 11 章事件。接口名是我们的抽象，不是 Pi SDK 原名。

保存偏好/收藏只在用户明确提出或点击操作时执行，服务端记录 originatingMessageId 或 UI 操作证据，并用 mutationId 幂等提交；模型推测的偏好不自动写入。

Pi 只看到本轮相关的白名单业务工具：`train_resolve_locations`、`train_search`、`train_route`、`library_save_query`、`preferences_set`。工具内部再调用 MCP 或业务服务。这样可以固定 schema、限流和结果结构，避免把 MCP 所有工具无条件暴露给中转站。

当前 Pi SDK 文档的 `noTools: "builtin"` 可禁用默认内置工具；实施时还必须验证最终有效工具列表，确保 read/bash/edit/write 等均不存在。自定义 ResourceLoader 只提供应用定义的提示和工具；不能依赖默认发现机制扫描用户 HOME 或工作区的 AGENTS.md、扩展和技能。[S06]

### 6.2 会话隔离与恢复

一个会话只能有一个活动 run。数据库保存应用可见的消息和执行事实，另存 SDK 版本化的完整 Agent 上下文 checkpoint；运行时可用内存 SessionManager。checkpoint 的导出/恢复必须通过安装版公开 API 验证，不能仅把 UI 文本拼回模型。

checkpoint 只在完整有效的回合边界提交，保留匹配的 toolCallId/toolResult。中断后从最近有效 checkpoint 恢复，并加入应用生成的“上次执行已中断、已有结果 ID”说明；不得回放缺少结果的工具调用，也不能自动重做外部操作。升级 Pi 前验证旧 checkpoint 迁移，失败则保留历史、开启新的 Agent 上下文。

当前查询条件在业务层保存，不只存在模型上下文里。提示中只注入允许的相关偏好、时间和结果摘要。完整票表保存在数据库，给模型的是带 resultId 的限量摘要；用户看到的卡片直接来自结果 API。

### 6.3 中转站配置与自检

首版 UI 支持配置一个启用的模型档案：名称、HTTPS baseUrl、协议、modelId、API Key。协议明确选择 `openai-completions`、`openai-responses` 或 `anthropic-messages`；启用哪一种取决于真实端点，不依据模型名字推断。[S07]

保存配置只标记 configured，不代表 ready。依次测试文本、流式、无副作用工具、多字段/数组 schema、工具结果续答、真实查票。必须覆盖用户此前遇到的“array 缺 items”类错误；不能靠删除所有工具让测试变绿。

可配置兼容字段必须白名单化，不开放整份 Pi 配置编辑。Pi 的某些密钥/头部配置支持命令解析，应用不能把用户文本直接交给该机制；通过受控凭据注入或环境变量引用传值，禁用 `!command` 等命令入口。[S07]

配置更新使用 version 乐观锁；已有 run 固定模型配置版本，新 run 才用新配置。工具 schema 不兼容时展示错误阶段和 traceId；不私自切换另一供应商，不把测试结果或密钥输出到聊天。

## 07. 12306 MCP 桥接与数据适配

### 7.1 仓库基线

读取仓库：`JWJW000/12306-mcp`。本次核验 main 对应 commit：

```text
ff6439da6f63d7d72181abea4568abd69878c600
```

实施者拉取后核对该提交；若要更新，记录差异并重跑适配测试。不要把源码 blob SHA 当成 commit SHA。[S10]

已核验：`get-tickets` 支持 `format: "json"`，但输出仍位于 MCP 的 `content[].text` 中；若干失败分支直接返回 `Error: ...` 文本。不能只根据 HTTP 成功或 `isError` 缺失就认定成功。[S11]

当前 TicketInfo 具有 `train_no`、`start_train_code`、日期、时间、站点、telecode、`lishi` 和 `prices`；Price 内包括席别、num、price 等。字段存在不代表值始终可用。[S12]

### 7.2 首版白名单与固定调用

底层仅允许日期/站点解析、`get-tickets`、`get-train-route-stations` 所需工具；实际名称与 inputSchema 从 `tools/list` 核对。将名称和 schema 摘要锁入测试，不接受运行期间未经审查的新工具。

查票调用强制 `format: "json"` 小写；每个站对默认 `limitedNum: 0`，避免在筛选前截断。`limitedNum` 不是余票张数。席别和精确到达时间筛选在业务层完成。经停站参数中的内部 train_no 必须取自结果，不拿显示车次号猜测。

### 7.3 解析顺序与错误规范

先检查连接/协议错误及 `isError`，再识别该工具约定的 Error 文本；存在可验证 structuredContent 时优先使用，否则解析 text JSON。多个文本块时按测试证明的规则组合，禁止盲目把任何字符串拼成数组。JSON 或字段校验失败返回 MCP_SCHEMA_MISMATCH，不能回退成空列表。

上游返回的 cookie、secret、购票 token、鉴权头必须在持久化前剔除。保留的是脱敏样本、schemaVersion、源仓库提交和 traceId，不把购票相关敏感字段发给手机或模型。

### 7.4 字段映射原则

`start_train_code` → 展示车次；`train_no` → 受控详情引用；站点名称和编码同时保留。日期必须按源码及样本核验语义，区分列车始发日期与旅客乘车日期；如发现源适配器把两者混淆，修正并添加跨日回归，不仅改展示。

`num` 为正整数或明确“有”才是 available；零/无为 sold_out；明确不适用为 not_applicable；候补仅在可验证标识存在时标 waitlist；空串、未识别值为 unknown。保存 rawLabel 供诊断。

价格必须为有限非负数且单位语义核验通过；未知为 null。零价格没有可验证业务含义时视为 unknown，不能默认免费。首版内部将有效人民币价格规范为整数分，同时保留币种与来源；转换测试必须验证单位和舍入。

### 7.5 生命周期

应用启动建立一个受控 MCP 子进程连接；初始化和 tools/list 有超时。子进程崩溃使用有上限的退避重启。取消先发协议取消/中止等待；共享 MCP 若无法中止上游请求，就丢弃迟到业务结果并记录 late_result，不杀死无关请求、不重写已终止 run。

## 08. 共享契约：卡片、查询与结果

以 `packages/contracts` 的运行时 schema 为单一事实来源，派生 TypeScript 类型与 OpenAPI。下方是领域结构草案，编码智能体必须补齐校验、注释和测试；不是可直接导入的第三方类型。

```ts
type LocationRef = {
  kind: 'city' | 'station'; name: string;
  code?: string; selectedStationCodes?: string[];
};
type TicketQuery = {
  date: string; timezone: 'Asia/Shanghai';
  from: LocationRef; to: LocationRef;
  trainTypes: string[];
  departMinutes: [number, number];
  arriveBefore?: string; // RFC3339，含 +08:00
  seatPreference?: string;
  onlyAvailable: boolean;
  sort: 'departure' | 'arrival' | 'duration';
};
type Seat = {
  kind: string;
  availability: 'available' | 'sold_out' | 'waitlist'
    | 'not_applicable' | 'unknown';
  count: number | null;
  priceMinor: number | null;
  currency: 'CNY'; rawLabel?: string;
};
type TrainTicket = {
  id: string; trainCode: string;
  from: { name: string; code: string };
  to: { name: string; code: string };
  departureAt: string; arrivalAt: string;
  durationMinutes: number; seats: Seat[];
};
```

查询结果包必须包含以下字段：

| 字段 | 约定 |
| --- | --- |
| schemaVersion / id / runId | 版本、不可变结果 ID、所属执行 |
| query / tickets | 已校验条件及卡片数据；不混入模型文字 |
| fetchedAt / queryStartedAt | 数据完成时间和开始时间；缓存沿用原值 |
| source | mcp:12306；仓库 commit；adapterVersion |
| coverage | complete/partial；requested/succeeded/failed 站对 |
| origin | live/cache/fixture；fixture 不得进入生产结果流 |
| warnings | 部分失败、截断、缺失字段等机器可读提示 |
| parentResultId | 本次从哪份历史条件刷新或筛选而来 |

结果不可原地覆盖。筛选可产生派生视图，保留原 fetchedAt；刷新产生新结果 ID。票卡去重依据业务日期、内部车次及上下车站，而非只按展示车次号。

大结果服务端分页，卡片一次加载默认 20 条。超过容量只显式标记 truncated，不让模型生成丢失字段。“完整覆盖”与“列表分页”是两件事，UI 必须分别表达。

## 09. 数据模型与持久化

以下为逻辑表设计；迁移需要明确外键、唯一约束、事务和索引。数据库位于服务器本地持久卷，启用外键并根据实际驱动配置 WAL/busy timeout；并发与备份行为要测试。[S15]

| 表 | 核心字段 / 约束 |
| --- | --- |
| devices | id、name、token_hash、created_at、expires_at、revoked_at |
| pairing_codes | code_hash、expires_at、attempts、consumed_at |
| conversations | id、title、query_state_json、created/updated/deleted_at |
| messages | id、conversation_id、run_id、role、parts_json、status、created_at |
| runs | id、device_id、conversation_id、client_request_id、request_hash、kind、status、config_version、error_code、lease、started/finished_at |
| run_events | run_id、seq、type、payload_json、created_at；主键(run_id,seq) |
| tool_calls | id、run_id、name、arguments_redacted、status、result_id、error、times |
| query_results | id、run_id、schema_version、payload_json、fetched_at、parent_id |
| favorites | id、name、query_json、snapshot_result_id、created_at |
| preferences | key、value_json、version、source_message_id、updated_at |
| model_profiles | id、base_url、api、model_id、secret_ciphertext、key_version、config_version、enabled |
| agent_checkpoints | conversation_id、sequence、sdk_version、context_json、completed_run_id |

诊断 run 的 conversation_id 可为空，普通对话/查询则不能为空；诊断结果只进入运行记录，不污染用户聊天。`runs` 对 `(device_id, client_request_id)` 建唯一约束。相同幂等键但请求内容不同返回 409，不覆盖旧请求。单会话活动执行用事务加唯一约束/等价原子保护，不只用前端按钮防重。

完成一个业务结果时，在同一数据库事务中保存 result、tool 状态和 result.ready 事件；再发布实时通知。终态保存消息、有效 checkpoint 和 run 终态。事件发送失败不能回滚已成功的业务结果。

默认聊天与收藏保留到用户删除；执行诊断日志 30 天，完整 SSE 重放 7 天。超期事件仍可从最终快照恢复。手机只缓存最近 20 个会话和收藏，缓存按 server+device 命名空间隔离；换服务器、解绑时清理。

删除会话要处理消息、事件、上下文和未收藏结果；被收藏快照保留，直到删除收藏。存在活动 run 时返回 409 并要求先取消。备份包含已删除数据时，在设置和运维文档说明保留期限，不承诺即时从所有备份抹除。

## 10. HTTP API 契约

除 `/healthz` 和受限配对兑换外，接口必须校验设备 Bearer token 及是否撤销。列表统一使用游标分页 `items/nextCursor`；错误统一 `{error:{code,message,retryable,traceId,details?}}`。details 不含栈、密钥和原始上游正文。

| 方法与路径 | 用途 / 主要约定 |
| --- | --- |
| GET /healthz | 进程存活，不暴露配置；深度依赖检查走鉴权接口 |
| POST /v1/auth/pair | code + deviceName 换取设备凭据，返回一次 |
| DELETE /v1/auth/device | 撤销当前设备；服务器 CLI 可撤销指定设备 |
| GET/POST /v1/conversations | 会话列表 / 创建会话 |
| GET/DELETE /v1/conversations/:id | 会话元数据及快照游标 / 删除 |
| GET /v1/conversations/:id/messages | 历史消息、结果引用、活动 run 和 lastSeq |
| POST /v1/conversations/:id/runs | 创建 run；202 返回 runId、status、eventsUrl |
| GET /v1/runs | 执行记录列表，支持会话与状态筛选 |
| GET /v1/runs/:id | 状态、消息快照、结果引用、lastSeq |
| GET /v1/runs/:id/events | SSE；after 游标；Authorization header |
| GET /v1/runs/:id/event-page | 断流回退分页事件，不创建新 run |
| POST /v1/runs/:id/cancel | 幂等取消；终态则返回现有终态 |
| GET /v1/results/:id | 完整结果元信息及分页 tickets |
| POST/GET /v1/favorites | 保存条件和快照引用 / 列表 |
| PATCH/DELETE /v1/favorites/:id | 改名/条件 / 删除 |
| GET/PUT/DELETE /v1/preferences/:key | 显式偏好管理，写入使用版本号 |
| GET/PUT /v1/settings/model | 脱敏配置 / 更新；Key 只写不读 |
| POST /v1/diagnostics | 创建自检 run，响应与普通 run 一致 |
| GET /v1/status | 模型/MCP 的检查状态、时间，不只返回布尔值 |

所有新增执行统一经过 runs 入口；不要再独立实现一套绕过鉴权和日志的 `/chat` 或 `/query` 路径。run.kind 至少区分 `chat`、`ticket_search`、`train_route`、`diagnostic`。表单直接查票/刷新不必再次调用模型，仍复用 TrainService 与事件记录。

请求示例（设计示例，不是真实调用）：

```json
{
  "clientRequestId": "a-client-generated-uuid",
  "kind": "chat",
  "input": {
    "text": "查询2026年9月30日北京到洛阳的高铁",
    "baseResultId": null
  }
}
```

服务端校验文本长度和结构；input 是按 kind 区分的联合类型。刷新用 ticket_search + query + baseResultId；经停站用 train_route + resultId + ticketId，不能让客户端任意传内部上游密钥或命令。

## 11. 可恢复事件流与执行状态机

### 11.1 事件协议

手机用带 Authorization 的 fetch 读取 SSE，不把 token 放 URL。实现 UTF-8 分片、空行分帧、多行 data、取消与重连解析；不得假定一个网络 chunk 就是一条事件。SSE 的 id/event/data 与断线游标是基础格式，具体负载由本项目定义。[S14]

```text
id: 18
event: result.ready
data: {"v":1,"runId":"r_1","seq":18,
data: "type":"result.ready",
data: "occurredAt":"2026-09-16T10:00:00Z",
data: "payload":{"resultId":"q_1","kind":"train.tickets"}}

```

上例使用多行 data，按 SSE 规则合并后为合法 JSON；实际也可发送单行 data。事件完整公共信封为 `{v,runId,seq,type,occurredAt,payload}`，type 与 event 相同。

| 事件 | 含义 |
| --- | --- |
| run.accepted / run.started | 已保存请求 / 开始实际执行 |
| message.delta / message.completed | 带 messageId 的增量 / 最终权威文本 |
| tool.started / tool.completed | 白名单工具开始/结束；包含明确 status |
| result.ready | 数据已入库，可按 ID 读取卡片 |
| input.required | 需要选择车站或补全条件；本 run 正常终止等待用户 |
| run.completed | 成功终态；可带 warnings 和 partial 标识 |
| run.failed / run.cancelled / run.interrupted | 失败、取消、重启中断 |

不转发模型的隐藏推理或原始 thinking 事件；只展示应用可验证的步骤、简短结果说明和工具事实。

### 11.2 重放与顺序

事件先持久化后发布，每个 run 的 seq 严格递增。客户端仅应用大于 lastSeq 的事件，重复不重复追加文本。消息增量默认约 100ms 合并一次，完成事件携带最终全文以校准丢失/重复；结果卡片按 resultId 去重。

建立订阅时原子衔接“补历史”和“监听新增”，可使用数据库序列作为唯一顺序：先监听再补读，缓冲新事件并按 seq 去重，防止两者之间漏事件。lastSeq 必须随消息快照一起返回。

每 15 秒发不落库的注释心跳。网络恢复 GET 原 run 状态，再以 after 续传；游标过期返回明确快照恢复提示，不能重新提交用户消息。若 Android WebView 流式不可用，降级为同一 run 的事件轮询，并在诊断报告标明。

### 11.3 状态机与恢复

```text
queued -> running -> succeeded
                  -> failed
                  -> cancelling -> cancelled
                  -> interrupted
```

`input.required` 对应 succeeded + outcome=needs_input，不占用活动锁。模型解释失败但有有效票表：succeeded + warning；工具失败不得包装成成功票表。

手机离线不取消服务器执行，但 run 受超时限制。服务重启把未确认结束的活动 run 标 interrupted；不自动重新查票、发送或写入。客户端明确提供“重新执行”，生成新的幂等键和 retryOfRunId。

取消与完成通过数据库条件更新竞争，终态只能写一次。取消后的迟到结果不推进 run；已经成功落库的结果保留，界面说明“停止后续处理，不撤销已完成查询”。

## 12. 认证、密钥、网络与安全边界

### 12.1 设备配对的最小方案

服务器 CLI 生成短期高熵一次性配对码，默认有效 10 分钟，仅本地管理操作可创建。兑换成功后发一个 32 字节随机设备 token，默认有效 90 天，可撤销；服务器只存哈希。v0.1 不另造 JWT + 刷新令牌系统，过期重新配对。配对尝试限流且错误不泄露设备信息。

Android 用 Keystore 中的密钥加密设备 token，密文放应用私有空间；Keystore 存放的是加密密钥，不是随意的字符串保险箱。通过专用窄接口存取凭据，不暴露通用解密或任意路径能力。不能把 localStorage、普通配置文件或 Tauri Store 当成加密存储。[S13]

手机不持久保存中转站 Key；设置提交后清空输入和内存引用。服务器对模型密钥使用成熟加密库和独立主密钥加密，主密钥从受保护文件/secret 读取，包含版本用于轮换。日志 redact 在统一中间件和上游错误映射两处落实。

### 12.2 URL 与工具边界

后端中转站目标由管理员域名白名单约束：只允许 HTTPS、禁止 URL 用户名密码、禁止重定向带出凭据。检查解析地址、重定向和实际连接目标，阻止环回、链路本地、云元数据和未授权内网地址；合法私网中转站只能由服务器管理员显式配置，不能由模型放宽。

不接受手机提交 stdio 命令、环境变量或任意 MCP URL。MCP 子进程使用最小环境变量集合，不继承模型密钥与服务器管理密钥。Pi 的运行目录不挂载用户 HOME、SSH、NAS 根目录或 Docker socket。[S08]

CORS 仅放行实际验证的 Tauri Android origin 和独立开发 origin，凭据不通过 cookie；CORS 不是鉴权。CSP 限制 connect-src，生产服务域名明确配置；不能为适配未知地址直接放开所有 http/ws 目标。Tauri capabilities 仅授予必要本地命令。[S16]

### 12.3 生产要求

公网必须有效 HTTPS，不关闭证书验证。开发临时 HTTP 只限明确的本地开发构建，不能进入 release。生产禁用 fixture 模式与调试端点；未配置密钥或访问令牌时失败关闭。数据库和备份权限隔离，遥测默认不启用，不向无关平台发送聊天。

## 13. 配置、部署与维护

### 13.1 配置样例的地位

随包 `server.env.example` 全为占位符，是应用需要实现的配置约定，不是 Pi 直接读取的标准环境变量。缺少真实域名、协议、modelId、密钥、服务器系统信息和签名文件时，保持待配置；不得从历史聊天中复用服务器密码或推断部署目标。

后端启动校验配置。若手机管理模型配置，则 bootstrap 环境配置只作首次导入，之后数据库模型档案为准；重复启动不覆盖手机更新的档案。GET 配置只返回 maskedKey/hasKey，不能返回密文或明文。

### 13.2 容器与入口

生产默认 api 容器承载后端和固定版 MCP 子进程，持久卷 `/app/data`；反代通过内部端口 3000 转发。利用用户现有 Nginx/Caddy，不覆盖既有站点；Compose 的示例反代通过可选 profile 启用。

构建分阶段、非 root 运行；只读根文件系统和独立临时目录按依赖实际需求验证。应用与 SQLite 驱动要在服务器真实 CPU/系统架构上测试，不能把开发机 node_modules 复制过去。

反代为事件流关闭响应缓冲，读超时大于心跳间隔；不要缓存 SSE。文档分别提供域名、证书、WebView origin、端口、防火墙和回滚配置步骤。对外仅开放需要的 HTTPS 入口。

### 13.3 备份与恢复

使用 SQLite 驱动备份接口/在线备份机制生成一致快照，或停写后备份；不要仅复制活跃 WAL 模式中的主 db 文件。[S15]

每日备份为建议的运维默认，保存 7 份；备份与主密钥分离保管。实现一次“新目录恢复数据库 → 读取收藏与消息 → 重新授权设备”的演练，记录结果。恢复旧库后默认撤销恢复出的设备 token，防止撤销状态回滚。

### 13.4 Android 构建

提供初始化、开发和 build:android 入口，底层按锁定版 Tauri CLI 执行。APK 使用固定包名和递增 versionCode。release keystore 和密码由用户安全提供，不入库、不打包到文档；维护升级必须保留相同签名身份。[S02]

验收至少记录一台真实 Android 设备的系统、WebView、屏幕与安装包哈希。Web 端 Playwright 通过不等于 Android 真机通过。没有设备时相关项标 NOT_RUN，不编造截图或报告。

## 14. 限额、诊断与故障语义

以下为工程保护默认值，不是 12306 官方配额，也不是性能承诺；实施者可按实测收紧。

| 项目 | 默认约定 |
| --- | --- |
| 活动执行 | 每会话 1 个；全局最多 2 个 |
| 输入 | 最长 8000 字符；请求体另设合理大小上限 |
| Agent 工具调用 | 每 run 最多 8 次；底层站对请求另计 |
| 站对与并发 | 每次最多 12 个站对，MCP 查询串行 |
| 外部查询 | MCP 查询调用全局至少间隔 1 秒；缓存和用户确认优先 |
| 调用超时 | 单次 MCP 20 秒；整个 run 120 秒；启动单独限时 |
| 重试 | 只读临时网络失败最多 1 次；429 尊重 Retry-After；403/校验错误不循环重试 |
| 结果缓存 | 同条件默认 30 秒；展示实际 fetchedAt 与 cache 来源 |
| 工具响应 | 默认上限 2 MB；超限明确错误/截断标记 |
| 模型摘要 | 默认最多 20 条业务摘要；卡片数据不受摘要数量限制 |

MCP 一次调用内部可能发起多个 HTTP 请求，G0 必须核对源码和实际请求量，必要时在服务内部限流；这不是“每个外部 HTTP 请求已被控制”的承诺。上述 12 个站对不保证在超时内全部完成；达到总时限就保留成功站对并标 partial，或无有效结果时失败。所有 SDK 内置重试也必须纳入同一预算，不能出现三层各重试一次导致实际放大。

自检结果使用 `not_configured / configured / testing / passed / failed / stale`，带配置版本和时间。模型配置改变使旧结果 stale。健康探测不应周期性调用付费模型或大量请求 12306。

错误码至少包含：AUTH_REQUIRED、DEVICE_REVOKED、CONFIG_MISSING、RELAY_AUTH_FAILED、RELAY_PROTOCOL_ERROR、TOOL_SCHEMA_INVALID、MCP_UNAVAILABLE、UPSTREAM_BLOCKED、MCP_SCHEMA_MISMATCH、INVALID_QUERY、RUN_CONFLICT、RUN_TIMEOUT、RUN_CANCELLED、RUN_INTERRUPTED、CURSOR_EXPIRED。

日志记录 runId、toolCallId、脱敏参数摘要、耗时、错误阶段、可用时的 token 用量。未知用量/计费为 null 或“未提供”，不能默认显示免费。首版不做供应商自动回退。

## 15. 分阶段开发任务与交付门槛

### G0：依赖与真实链路验证

检查工作区和运行环境；固定依赖、拉取 MCP 基线；实现一个无副作用工具及 minimal Pi 调用。测试中转站文本/流式/工具/续答，再做一次真实查票。核对价格、日期、车站覆盖、取消行为以及有效工具名单。

交付 `DEPENDENCIES.md`、脱敏 `COMPATIBILITY_REPORT.md`、核心样本和失败用例。缺真实配置时明确 BLOCKED，但继续 G1 的契约工作；未通过不能声称真实集成完成。

### G1：工程骨架与共享契约

建立 workspace、contracts、lint/typecheck/test、基础后端和数据库迁移。定义 Run、Event、TicketQuery、TicketResult 与统一错误；建立 fake relay/fake MCP 供离线测试，生产严格排除。

交付 OpenAPI、schema 测试、数据库初始化和 `.env.example`。配置优先级、版本与 API 命名在此关固定。

### G2：后端查询与恢复闭环

实现配对鉴权、幂等 runs、事件持久化、Pi 适配、受控 MCP、TrainService、结果保存、取消、重连、重启中断、收藏与偏好。表单路径和 AI 路径复用同一个服务。

关卡标准：脚本客户端能完成查票、读卡片、断流续传、重试不重复和模型总结失败仍保留数据。持久化后才推送 result.ready。

### G3：iOS 风格 UI 与页面

实现设计变量、四页导航、对话详情、输入框、车票卡片、筛选 Sheet、站点选择、历史、收藏与设置。使用 assistant-ui ExternalStoreRuntime 驱动真实业务状态，不另造客户端 Agent。

关卡标准：所有状态有页面；fixture 清晰标记；无假按钮。提交 360/390/430 宽度、明暗主题的组件截图和测试。

### G4：Android 打包与设备安全

接入 Tauri、Keystore 窄插件、安全区域、返回键、键盘、网络恢复；验证 CORS/CSP 和自有 HTTPS。完成设备撤销、缓存隔离和真机回归。

关卡标准：真实 Android 安装运行；token 不明文持久化；关闭/重开找回同一结果；不申请无关权限。无设备则记录未验证，不以模拟器结果替代。

### G5：部署、故障与数据演练

提供非 root 镜像、Compose、反代样例、健康检查、日志轮换、备份恢复及回滚说明。测试错误注入、断网、重启、上游拦截、无效 schema、缓存过期。

未经明确授权不登录生产服务器、不改 DNS、不替换现有反代、不执行数据库破坏性变更。部署所需操作应当独立可审查。

### G6：签名与最终交付

执行第 16 章矩阵并提交证据。提供源代码提交号、配置清单、安装步骤和已知限制；具备签名条件则交付 release APK 和 SHA-256。所有 NOT_RUN/BLOCKED 单列。

每个阶段用独立可回滚提交推进。不要一次生成整个项目后再统一排错，也不要为了通过测试而删除鉴权、工具或真实调用。

## 16. 验收矩阵：必须保留证据

自动测试使用冻结时钟和明确 fixture；真实测试使用测试当天允许查询的日期。2026-09-30 只作为需求示例及冻结时钟用例，不应成为会随时间失效的 live 测试日期。

| 编号 | 场景 | 通过条件 |
| --- | --- | --- |
| A01 | 配对成功 | 码只兑换一次，设备 token 只返回一次 |
| A02 | 过期/错误配对码 | 拒绝、限流、不泄露已有设备 |
| A03 | 设备撤销 | 所有后续 API 被拒绝，已有 SSE 及时断开 |
| A04 | 凭据存储 | 手机和日志无明文持久 token/模型 Key |
| A05 | 配置缺失 | 明确未配置，不伪造连接成功 |
| A06 | 中转站对话 | 真实文字和流式均通过，记录协议/模型 |
| A07 | 工具 schema | 数组 items、多字段和返回续答通过 |
| A08 | 关闭内置工具 | 有效列表无通用文件/终端工具 |
| A09 | 真实查票 | 来源、时间、范围和卡片字段可核对 |
| A10 | 文本包裹 JSON | 正确解析 content.text，不当作自然语言 |
| A11 | Error 文本 | isError 缺失也判失败，不返回空票表 |
| A12 | 无效/缺失字段 | 拒绝或明确降级 unknown，不补编 |
| A13 | 城市多站 | 展示实际站对；超限先选择，不静默截断 |
| A14 | 部分站对失败 | 保留有效结果，coverage=partial |
| A15 | 所有站对失败 | 查询失败，不显示无票 |
| A16 | 席别语义 | 优先与仅有票不同；空串/未知不误判 |
| A17 | 价格与日期 | 单位、零值、跨日、始发/乘车日期回归通过 |
| A18 | 精确筛选 | 分钟边界、到达日期和排序正确 |
| A19 | 连续对话 | 改时间保留日期地点；服务端条件可核对 |
| A20 | 经停站 | 使用正确内部标识；请求受结果 ID 约束 |
| A21 | 收藏与刷新 | 条件/快照分离，刷新产生新 ID |
| A22 | 重复发送 | 相同键返回同一 run，异内容返回 409 |
| A23 | 同会话并发 | 事务拒绝第二个活动 run，不覆盖上下文 |
| A24 | SSE 分片 | 中文拆字节、多帧/半帧、重放不乱码不重复 |
| A25 | 断网重连 | 继续同一 run；不重新扣一次模型/查票调用 |
| A26 | 重放窗口过期 | 最终快照恢复，不无限重试旧游标 |
| A27 | 模型总结失败 | 已成功的票卡仍能读取，显示 warning |
| A28 | 取消竞争 | 终态唯一，迟到事件不重启 run |
| A29 | 服务重启 | 活动 run 标 interrupted，不自动重做 |
| A30 | checkpoint 恢复 | 工具调用与结果成对，不触发协议 400 |
| A31 | 危险输入 | 任意命令/MCP 地址/恶意 HTML 均无执行能力 |
| A32 | URL 安全 | 重定向、内网、元数据目标被策略阻止 |
| A33 | 预算与重试 | 调用次数、超时和上游限流符合配置 |
| A34 | 离线历史 | 可看缓存，不能伪装执行新查询 |
| A35 | Android 交互 | 键盘、返回、草稿、滚动和字号真机通过 |
| A36 | 主题/窄屏 | 两种主题和三种宽度无溢出、无 hover-only 操作 |
| A37 | 缓存与删除 | 换服/解绑清理；删除关联关系符合规则 |
| A38 | 备份恢复 | 一致快照可恢复，恢复后旧设备授权失效 |
| A39 | 安装更新 | APK 可安装；同签名升级保留数据 |
| A40 | 证据真实性 | fixture 与 live 分开，未测明确 NOT_RUN/BLOCKED |

测试报告每项至少记录状态、日期、环境、命令/步骤、结果摘要和脱敏证据路径。失败截图也保留。联网测试不得在 CI 中不受控高频重复请求上游。

## 17. 交付目录、运行入口与完成定义

### 17.1 编码智能体必须交付的文件

完整工作区及锁文件；共享 schema 和 `openapi.yaml`；迁移与种子样例；Pi/MCP 接入测试；UI 与 Android 适配；Dockerfile/Compose/反代样例；`README.md`；`DEPLOYMENT.md`；`BACKUP_RESTORE.md`；`COMPATIBILITY_REPORT.md`；`TEST_REPORT.md`；`PROGRESS.md`；`KNOWN_LIMITATIONS.md`。

release APK 与签名信息按条件交付，签名密钥永不入仓库。配置样例不含真实域名账号密码。保留依赖许可证与第三方声明，尤其是引入或复制的 UI 源码和 MCP 代码。

### 17.2 要求实现的统一脚本入口

```text
pnpm install --frozen-lockfile
pnpm dev
pnpm dev:server
pnpm dev:mobile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm diagnostics:relay
pnpm diagnostics:mcp
pnpm db:migrate
pnpm device:pair
pnpm device:revoke
pnpm backup
pnpm build
pnpm build:android
```

这些是需要创建的项目脚本，不是现成 SDK 命令；README 要说明参数和必需环境。破坏性操作与 live 测试需显式开关，不挂到默认 `pnpm test`。

### 17.3 完成定义

用户从 Android 安装包进入，连接服务器，中转站工具调用自检通过，完成一次真实查询，修改条件、收藏，关闭重开后找到原结果，并刷新为新结果。测试 A01—A40 必须逐项报告，存在真实集成、设备安全或 Android 真机阻塞时只能称“部分完成”，不能标整体完成。

首版交付不承诺实时余票永远准确、不承诺 12306 接口永久稳定、不承诺所有中转协议都可兼容。此版本验证的是受控接入、可解释状态和可靠的数据处理。

## 18. 待填配置与后续扩展

实施前不重复询问已确定事项。下表是部署参数清单，允许先占位实现；涉及真实凭据时通过安全渠道配置，不粘贴进方案。

| 待填项 | 处理方式 |
| --- | --- |
| 助手域名/证书 | ASSISTANT_PUBLIC_URL；必须有可用 HTTPS |
| 中转站地址、协议、模型 | 使用设置或安全配置，不猜模型别名 |
| 中转站密钥 | 后端 secret；不进入前端和版本控制 |
| 服务器 OS/架构/端口 | 部署前只读检查，记录实际资源，不沿用历史凭据 |
| Android 设备与版本 | G4 真机报告记录，不假设手机型号 |
| 包名和签名 | 默认开发包名可用 dev.personal.assistant；发布前确定 |
| 安装密钥/主加密密钥 | 用户生成并安全保管；无密钥则明确阻塞项 |

v0.2 才考虑持久调度、持续查票及通知；必须另行设计授权、上游调用限制和手机推送。v0.3 再考虑脚本状态与限定目录资料查询。当前只保留可扩展的工具注册接口与 card kind，不提前创建万能调度器或权限市场。

## 19. 参考资料与核验记录

访问/核验日期均为 2026-09-16。引用用于说明依赖事实；本文接口、限额和项目结构均是本项目设计。动态文档可能变化，实施时以锁定依赖对应的实际 API 为准。

[S01] Tauri — Prerequisites（Android 构建前提）
https://v2.tauri.app/start/prerequisites/

[S02] Tauri — Android Code Signing（签名）
https://v2.tauri.app/distribute/sign/android/

[S03] Tauri — Shell（移动端限制）
https://v2.tauri.app/plugin/shell/

[S04] Konsta UI — React App（iOS 主题）
https://konstaui.com/react/app

[S05] assistant-ui — ExternalStoreRuntime（自有状态接入）
https://www.assistant-ui.com/docs/runtimes/custom/external-store

[S06] Pi — SDK（包名、工具、会话、事件、ResourceLoader）
https://pi.dev/docs/latest/sdk

[S07] Pi — Custom Models（协议、baseUrl、兼容与配置解析）
https://pi.dev/docs/latest/models

[S08] Pi — Security（沙箱与宿主权限边界）
https://pi.dev/docs/latest/security

[S09] Model Context Protocol — TypeScript SDK
https://ts.sdk.modelcontextprotocol.io/

[S10] 用户仓库 main 引用；核验 commit 为 ff6439da6f63d7d72181abea4568abd69878c600
https://api.github.com/repos/JWJW000/12306-mcp/git/ref/heads/main

[S11] 用户仓库固定提交 src/index.ts；重点核验 get-tickets 及失败分支
https://github.com/JWJW000/12306-mcp/blob/ff6439da6f63d7d72181abea4568abd69878c600/src/index.ts

[S12] 用户仓库 src/types.ts；核验 TicketInfo 与 Price；实施时使用同一固定提交复核
https://github.com/JWJW000/12306-mcp/blob/ff6439da6f63d7d72181abea4568abd69878c600/src/types.ts

[S13] Android Developers — Android Keystore system
https://developer.android.com/privacy-and-security/keystore

[S14] MDN — Using server-sent events
https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events

[S15] SQLite — Online Backup API / WAL（备份与本地数据库注意）
https://www.sqlite.org/backup.html
https://www.sqlite.org/wal.html

[S16] Tauri — Capabilities（命令能力边界）
https://v2.tauri.app/security/capabilities/

**文档边界声明：**本次完成的是方案、公开文档核验与仓库源码检查，没有部署服务器、执行中转站调用、实时查票或构建 APK。任何实现进度都必须由编码智能体重新测试并记录。
