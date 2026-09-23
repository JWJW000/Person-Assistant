# Pi 远程任务发布验收（0.17.10）

日期：2026-09-22，Asia/Shanghai。

**代码阻塞项已修复，Android 0.17.10 与生产网关已发布。两台正式机器已绑定 admin 并在线；不能将本次结果称为已完成安卓真机和用户账号登录后的全链路验收。**

## 2026-09-22 连续对话与云服务器整机管理（0.17.10）

输入区由 130px 缩至 78px；直接发送首条消息开始对话，自动生成标题，优化 AI 回复、表格、代码复制和流式状态。全量测试 62/62、移动端构建和 Android 签名通过，浏览器手机尺寸交互验收通过，发布包完整下载哈希已核对。

用户确认具体 root SSH 方案后，云服务器管理入口已部署，admin 可选择“云服务器管理”项目。真实 Pi 任务已通过 4 次 server-exec 操作验证宿主机 root、Docker/Nginx 状态和临时文件读写清理，run 成功，零工具错误；同一密钥从其他容器使用会被拒绝。未修改业务配置或重启业务服务，未进行安卓真机验收。详细证据、权限范围、依赖审计和回退目录见 [部署文档](../DEPLOYMENT.md)。

## 2026-09-22 Pi 输入框优化（0.17.9）

ChatGPT 风格圆角输入框已发布；手机尺寸浏览器验收覆盖继续、调整、排队、停止四种命令，忙碌/离线防重复提交、失败保留草稿、中文输入法和小屏布局。专项 API 与消息解析回归 3/3 通过，Android 构建签名通过。发布记录与回退路径见 [部署文档](../DEPLOYMENT.md)。0.17.8 的断点续传功能保留，train 下载域名已由用户改为服务器直连。仍未连接安卓真机。

## 2026-09-22 手机 Pi 任务交互优化（0.17.7）

机器、项目、模型和历史会话统一使用底部选择面板；模型支持名称/提供方搜索。新建任务将输入内容与执行配置分区，固定提交按钮；任务对话优化消息层级、Markdown、工具折叠、输入区和查看最新消息操作。复用已有 Radix Dialog，无新增依赖。

全量自动测试 61/61 通过，移动端生产构建与 Android release 构建签名通过，versionCode 为 17007。浏览器模拟接口验收覆盖 390×844 与 390×430：52 个模型搜索、机器切换后的项目/模型联动、保留任务输入、选择/关闭后的焦点恢复、创建请求模型值、对话展示；缩小可视区域后提交按钮仍完整可见。页面原生 select 数量为 0。未连接 Android 真机，浏览器尺寸验收不能替代真机键盘与系统返回键验收。

- 安装包：https://train.5wjw.cn/updates/personal-ai-assistant-v0.17.7-aarch64.apk
- SHA-256：`2d896c852c01362dbdd80f8a7d96136011579c220ed77dcd188181bc86cf4d7c`
- 更新清单回退备份：`/opt/assistant/backups/pi-ui-20260922-072550/latest.json`
- 已从服务器经公网 HTTPS 下载完整 APK（13,465,042 字节），SHA-256 与更新清单及本地签名产物一致；本机公网下载链路较慢，完整下载校验使用服务器发起。
- 本次仅更新客户端，生产 Java/Node/Runner 服务沿用上一轮修复版本。

## 2026-09-22 手机机器列表修复

用户反馈 App 看不到机器。生产日志确认 GET /ai/pi/hosts 开始后不返回；重现 h2c Upgrade 请求 3 秒超时、零响应。根因是 Java HttpClient 默认尝试 HTTP/2，而 Node WebSocket upgrade 监听器忽略了非 Runner 升级请求，连接悬挂。

修复：Java 转发明确使用 HTTP/1.1 并设置 30 秒请求超时；Node 对不支持的升级请求返回 426 并关闭连接。新增协议回归后专项验收 11/11 通过，Java package 成功，两个服务均已部署。本次无需更新 APK。

使用 admin 现有手机登录态经正式 https://ai.5wjw.cn/api/ai/pi 路径只读验证：hosts 返回 HTTP 200，两台机器均在线；两台机器的 projects 均 HTTP 200，各返回两个项目。首次机器列表耗时 1.8 秒，项目查询各 0.06 秒。登录令牌未打印或持久化。此验证覆盖登录后的机器与项目读取，不代表已完成完整 SSE 或手机真机交互测试。

当前 Java jar SHA-256：`48748e45bb7981084954b4d152da579a6a66aa05e2c05854194602532e6f6a06`。修复前备份：`/opt/assistant/backups/pi-httpfix-20260922-064528`；旧网关镜像：`deploy-server:before-pi-httpfix`。

## 本轮修复与证据

| 项目 | 结果 |
| --- | --- |
| B1 模型重试成功仍显示失败 | 分离模型错误与不可恢复错误；`provider_recovered` 回归通过 |
| B2 长历史截断 | App 分页读取全部事件；服务端 SSE 分页回放；任务详情返回全部 run；1,201 条事件测试通过 |
| B3 RPC 消息展示 | 识别原生文本增量，完成消息替换增量；按 toolCallId 合并工具，支持读取长输出；单测与 390×844 浏览器验收通过 |
| 生产业务 401 | 若依实际返回 HTTP 200/code 401；JSON 与 SSE 都恢复登录过期处理，新增回归通过 |
| Java SSE | 改为每个读取块立即 flush，避免应用层缓冲 |
| 构建与测试 | 全 workspace 构建通过；原全量 59/59；新增陈旧 PID 锁用例后 Runner 专项 10/10 通过；离线 Maven ruoyi-admin package 成功；Android release 构建及签名成功 |
| 浏览器 | 390×844：任务列表、新建表单、完成历史、工具展开、最终 Markdown 消息；使用临时模拟接口，非用户账号测试 |
| Linux Pi 0.84.2 | 生产 Node 网关 → Docker 内网 Runner → 真实模型，写入 PI_RELEASE_OK；第二轮追加 PI_CONTINUE_OK，均 succeeded |
| Mac Pi 0.84.2 | 生产 HTTPS/WebSocket → Mac Runner → 原有模型，实际文件写入 PI_RELEASE_OK，第二轮追加 PI_CONTINUE_OK，均 succeeded |
| Mac 扩展故障 | 原配置缺少 pi-pending-notifications 且存在重复 todo 注册，原始启动失败；专用远程启动入口使用 --no-extensions 后通过；此入口不支持用户扩展功能 |
| 接口边界 | 外网 /internal/pi/ 返回 404；Node 3000 仅绑定 127.0.0.1；Pi App API 未登录返回业务 401 |
| 容器重启 PID 复用 | 单实例锁记录进程启动身份，自动清理旧进程锁；保留并发启动拒绝逻辑；专项验收 10/10 通过 |
| 更新兼容 | versionCode 17006；签名证书与 0.17.5 一致 |

公网 APK 重新下载哈希与更新清单一致，已验证用户下载链路。

## 0.17.6 历史发布产物

- APK：https://train.5wjw.cn/updates/personal-ai-assistant-v0.17.6-aarch64.apk
- 更新清单：https://train.5wjw.cn/updates/latest.json
- APK SHA-256：`83e030d1ef4f0f2c820af967151450f696443d0fae1e21b7d074b7c6cbfe0b94`
- Java jar SHA-256：`72cac6e5da38dc820db186f7d8e0a6f33b8ea3142c01499fed780d1c759758e0`
- 生产备份目录：`/opt/assistant/backups/pi-20260922-053308`
- 数据库在线备份：网关数据卷中的 `pre-pi-20260922-053308.sqlite`
- 旧镜像：`deploy-server:pre-pi-20260922-053308`；旧 APK 和更新清单备份均保留。

## 正式绑定与待验收项

1. 已完成正式绑定：admin（1761100000000000001）。「我的 Mac Pi」与「我的服务器 Pi」均在线。Mac 使用用户级 launchd，在登录后自动启动；Linux 使用 Docker restart: unless-stopped，Docker 已设置开机启动。原独立验收身份已撤销。已实际重启两台 Runner 服务并确认自动重连、项目及模型列表正常；未重启操作系统。
2. 无已连接 Android 设备，本次未进行真实手机安装、后台恢复和系统更新弹窗验收。
3. 已使用 admin 现有登录态验证正式 HTTPS 机器列表与项目列表；登录后完整 SSE 链路仍未实测。真实模型测试通过内部验收身份发起，不能替代此项。
4. 模型目录仍来自 Runner 配置；扩展输入的持久化/一次性响应不在本次完成范围。Mac 远程入口禁用有冲突的扩展。

## 回退

优先恢复备份中的 `latest.json` 停止提示新版本；Java jar 与 compose 配置可从上述备份恢复后重建容器。Node 可使用旧镜像回退，数据库迁移为新增 Pi 表，回退时保留当前库；如确需恢复数据库，先停服务、另存当前库并评估回退期间写入，不能直接覆盖。

---

下面保留修复前的验收记录，结论以本报告上半部分为准。

# Pi 远程任务验收报告

验收日期：2026-09-22  
验收对象：当前工作区尚未提交的 Pi Runner、Node 网关、App 页面、Java 转发接口与部署说明。  
结论：**上线复验不通过。原有 55 项测试通过，但新增“模型重试恢复成功”用例失败；同时存在历史分页与真实 RPC 消息展示缺口，真实双机、反向代理和手机验收尚未完成。**

## 0. 最新上线复验（2026-09-22 13:21，Asia/Shanghai）

本轮重新构建全部 Node workspace 与 App，构建通过；重新运行新增用例前的全量测试，55/55 通过。随后加入 `provider_recovered` 用例，专项验收结果为 **8 通过、1 失败**。Java 编译结论沿用前一轮，本轮没有重新启动或验证 Java 运行链路。

| 问题 | 证据与影响 | 上线前要求 |
| --- | --- | --- |
| B1 / P1：临时模型错误恢复后仍被标为失败（动态复现） | `apps/pi-runner/src/index.ts:402` 将错误保存到 `managed.failure`，后续成功消息不清除；`:416` 因旧错误输出 run.failed，`:421` 不启动追加队列。`provider_recovered` 输入错误消息→自动重试→成功消息→settled，实际 failed，预期 succeeded | 区分可恢复的模型错误与不可恢复的运行错误；按最终重试结果结算，并验证成功后追加队列继续 |
| B2 / P1：已完成任务的历史超过 500 条时不完整（静态确认） | `apps/server/src/pi.ts:265` 每次最多返回 500 条；`apps/mobile/src/lib/piApi.ts:31` 固定 after=0，页面只调用一次，已完成 run 没有后续 SSE 补齐 | 实现分页或带游标快照；复验至少 501 条事件及多轮长任务重开后的完整内容 |
| B3 / P1：实际 Pi 文本流仍显示原始事件（静态确认） | 本地 Pi 0.84.2 文档中增量为 `assistantMessageEvent.delta`；Runner 直接透传，而 `apps/mobile/src/pages/PiTasksPage.tsx:151` 读取顶层 delta/text。完成消息 content 数组又被 JSON.stringify | 适配真实 RPC 消息为正常对话文本，合并增量并按 toolCallId 更新工具卡片；完成真实 App 展示验收 |

B1 的回归用例在 `apps/server/test/pi.acceptance.test.ts`，与其余模拟测试一样仅使用临时目录和本机网关，不调用真实模型。B2/B3 是源码与本地协议文档核对结果，不能描述成真实手机实测。此次仅补充验收用例、报告及方案状态，未修改生产实现，也未上线。

## 1. 已执行检查

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 工作区类型检查 | 通过 | contracts 构建及各包 typecheck；移动端类型由下一项构建覆盖 |
| 新用例加入前全量自动测试 | 55/55 通过 | 包含原有 47 项及 8 项故障验收；不包含最新 B1 |
| App 生产构建 | 通过 | TypeScript 与 Vite；存在包体积提示，不作为本次阻塞项 |
| Runner 构建 | 通过 | 使用构建产物进行模拟 Pi 集成验证 |
| Java `ruoyi-ai` 及依赖模块 | 增量编译通过 | 离线 Maven 构建；未启动若依，未执行真实鉴权/代理测试 |
| 最新故障验收 | **8/9 通过，1 失败** | 前述 8 项继续通过；新增 B1 模型重试恢复用例失败 |
| 本机真实 Pi | 部分通过 | CLI 版本为 0.84.2；隔离临时配置执行 `get_state` 成功，未发送模型 prompt |
| 真实 Mac/Linux 双机、手机、反向代理 | 未执行 | 未配对两台真实执行机，也未启动手机或浏览器交互验收 |

本次修复生产代码并保留原故障断言作为回归测试；未部署，也未把本地自动测试等同于真实设备验收。

## 2. 已修复并复验的问题

优先级 P1 表示必须在上线前修复。下列 Evidence → Finding → Path 分别给出证据、影响与修复位置。

### A1 / P1（已修复）：Pi 模型错误被标记为执行成功

- Evidence：`apps/server/test/pi.acceptance.test.ts` 的 `provider_error` 用例经过真实 Runner 子进程，模拟 `message_end.stopReason=error` 后发送 `agent_settled`。预期 `failed`，实际 `succeeded`。
- Finding：`apps/pi-runner/src/index.ts:323` 仅依据 `managed.aborted` 判断终态，没有记录最终助手消息的错误原因；失败后仍可能启动后续队列。
- Path：在 Runner 归一化终态的同一位置保存错误、停止与重试状态。正常 settled 只说明不再继续，不说明执行成功；失败时暂停后续队列。
- 复验：错误结束为 failed；工具单次失败后被 Pi 恢复不误判；正常结束为 succeeded；失败不自动启动后续任务。

### A2 / P1（已修复）：重连确认跳过事件缺口，可能永久丢输出

- Evidence：网关只收到 `seq=2`，没有 `seq=1`。重连 welcome 的确认游标实际返回 2，预期 0。用例 `reconnect acknowledges only the continuous event prefix` 已复现。
- Finding：`apps/server/src/pi.ts:326` 使用 `MAX(seq)`，而 `apps/pi-runner/src/index.ts:175` 按确认序号删除本机 outbox；缺失的早期事件会被误认为已经保存。
- Path：welcome 和 event_ack 必须共用连续游标计算；恢复前保留缺口以后的待传事件。App 也不能用 `Math.max` 跳过未应用的序号。
- 复验：输入顺序 2、断线、1、2 时，连续确认依次为 0、2，最终恰好展示两条事件。

### A3 / P1（已修复）：重复事件把已完成任务改回运行中

- Evidence：依次发送 `run.started(seq=1)`、`run.completed(seq=2)`，再重复发送完全相同的 started。预期继续 succeeded，实际变成 running。
- Finding：`apps/server/src/pi.ts:341` 只避免重复插入事件，后续状态更新和发布仍执行；数据库记录去重没有保证状态转换幂等。
- Path：重复事件只返回 ACK，不重新应用状态和广播；首次应用与事件插入保持事务一致，终态转换拒绝旧序号。
- 复验：完成后补传旧事件，不重新占用项目、不重复展示输出、不改写终态。

### A4 / P1（已修复）：初始指令被拒绝后，run 永久卡在 queued

- Evidence：提交 prompt 后执行端返回 `command_result.status=rejected`。命令记录变为 rejected，但 run 实际仍为 queued，预期 failed。
- Finding：`apps/server/src/pi.ts:336` 只更新命令表；`pi_runs` 中的 queued 会持续阻塞该项目的新 prompt，见同文件 `:215`。
- Path：对尚未启动的 prompt/follow_up 拒绝进行事务收尾并生成可回放的失败结果；不能把 steer 或模型修改的局部拒绝直接视为整个运行失败。
- 复验：初始拒绝后可以再次提交同项目任务；run 明确失败；重复拒绝响应不生成重复终态。

### A5 / P1（已修复）：新会话路径尚未落盘时，Runner 丢失会话绑定

- Evidence：本机 Pi 0.84.2 使用全新临时配置执行 `get_state`：`success=true`、存在 sessionFile 字段，但目标文件尚不存在。模拟相同的延迟落盘时序后，任务的 `session_ref` 实际为 null，预期非空。
- Finding：`apps/pi-runner/src/index.ts:292` 调用 `sessionRefFor`，后者直接 `fs.realpathSync` 尚不存在的文件；异常被 `consumePi` 误报为 `invalid_pi_json`，后续没有再次绑定。只在内存中继续正常，重启后可能新建会话而丢失上下文。
- Path：区分合法的待创建路径与已有文件校验；在首次持久化后重新确认并保存会话绑定。不要把文件系统错误统一归类为 JSON 协议错误。
- 复验：新建→执行→关闭 Runner→重新启动→继续同任务，仍使用同一个原生 Pi 会话；状态事件没有虚假的 JSON 错误。

## 3. 静态审查项

以下按实际源码控制流判定，尚未进行浏览器或真实设备复现；不能描述成已完成手机实测。

| ID / 优先级 | Evidence：位置与触发 | Finding：影响 | Path：修复与复验 |
| --- | --- | --- | --- |
| A6 / P1（已修复，待双机复验） | 切换 host 会清理旧项目、模型和会话选择，并重新选择新机器项目 | 防止携带上一台机器的项目 ID | 用两台机器不同项目验证提交 ID |
| A7 / P1（已修复，待手机复验） | 任务详情加载近期 run 的持久化事件，再从连续游标订阅；切换任务会清理组件事件与输入状态 | 已完成任务可恢复历史，缺口后的事件不会推进游标 | 验证 App 重开、任务切换和账号退出 |
| A8 / P1（已修复，本机复验通过） | Runner 使用状态目录独占锁；进程记录保存系统启动身份，只有身份匹配才终止，无法验证时保留 `needs_attention` 占用 | 避免 PID 复用误杀和两个 Runner 同时控制项目 | 已增加重复启动验收；仍需 Linux 实机复验 |
| A9 / P1（已修复，本机复验通过） | abort 后即使收到 settled 也不释放项目，等待受管进程退出后才写 cancelled | 避免旧终止定时器杀死随后启动的新任务 | 已增加“停止后立即继续”故障验收 |
| A10 / P1（已修复，本机复验通过） | welcome 后重发网关未决命令；Runner 将未派发命令拒绝、将已开始派发的命令标为 unknown，并取消重启时未派发队列 | 不自动重放不确定副作用，也不让命令永久悬挂 | 已增加断线后 unknown 核对验收 |

其他尚未达到方案的功能：模型列表来自手工 `config.models` 而非 Pi 能力查询；原始 RPC 文字增量没有完整适配为聊天消息，工具结果也未实现按 toolCallId 合并和长输出读取；扩展输入缺少持久化待响应请求及一次性响应校验。SSE 已支持断线重连与连续序号缓冲。这些仍应进入后续验收，不能因基础构建成功而视为已完成。

## 4. 复现命令与环境说明

以下从仓库根目录执行。第一次直接运行 pnpm 时触发依赖自动校验，因无 TTY 尝试重装依赖而退出。本次通过单命令环境变量关闭该自动安装行为，使用当前已安装依赖；没有清空 node_modules 或修改锁文件。

```bash
pnpm_config_verify_deps_before_run=false pnpm typecheck
pnpm_config_verify_deps_before_run=false pnpm test
pnpm_config_verify_deps_before_run=false pnpm --filter @assistant/mobile build
pnpm_config_verify_deps_before_run=false pnpm --filter @assistant/pi-runner build
pnpm_config_verify_deps_before_run=false pnpm exec vitest run apps/server/test/pi.acceptance.test.ts
mvn -o -f RuoYi-Vue-Plus/pom.xml -pl ruoyi-modules/ruoyi-ai -am -DskipTests compile
```

新增用例已纳入常规测试发现；最近一次全量运行的 55/55 是加入 B1 之前的结果，之后的专项运行是 8/9，通过数不能混用。单独运行新增文件前必须先构建 contracts 和 Runner，避免使用旧 dist。

用例只监听 `127.0.0.1` 随机端口，状态放在临时目录，退出时清理模拟 Runner 与模拟 Pi。运行环境需要允许本机监听；沙箱内最初因 EPERM 未能监听，允许本机测试后已执行到真实行为断言。没有使用模型密钥、发送模型任务或操作真实项目文件。

真实 Pi 只读探测的复现脚本：

```python
import json, os, pathlib, select, subprocess, tempfile, time

with tempfile.TemporaryDirectory(prefix="pi-rpc-smoke-") as directory:
    env = {k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "TMPDIR", "LANG")}
    env["PI_CODING_AGENT_DIR"] = str(pathlib.Path(directory) / "agent")
    proc = subprocess.Popen(
        ["pi", "--mode", "rpc", "--session-dir", str(pathlib.Path(directory) / "sessions")],
        cwd=directory, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True,
    )
    try:
        proc.stdin.write(json.dumps({"id": "probe", "type": "get_state"}) + "\n")
        proc.stdin.flush()
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if not select.select([proc.stdout], [], [], 0.5)[0]:
                continue
            line = proc.stdout.readline()
            if not line:
                raise RuntimeError("Pi exited before replying")
            message = json.loads(line)
            if message.get("id") == "probe":
                filename = message.get("data", {}).get("sessionFile")
                print({"success": message.get("success"), "sessionFilePresent": bool(filename),
                       "sessionFileExists": bool(filename and pathlib.Path(filename).exists())})
                break
        else:
            raise RuntimeError("get_state timeout")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
```

本机输出为 `success=True, sessionFilePresent=True, sessionFileExists=False`。脚本需要 PATH 中可用的 Pi 0.84.2；不包含模型 prompt。

## 5. 复验准入条件

1. 前一轮 A1–A10 修复结论与 8 项回归保留；本轮 B1–B3 必须完成修复和复验，最新 9 项故障验收及全量测试全部通过。
2. 补齐 App 历史、机器切换、实际 RPC 消息渲染和断网恢复的交互测试。
3. 在临时项目验证真实 Mac Pi 完整发任务、恢复、停止、模型错误和扩展输入。
4. 再验证 Linux Runner、若依实际登录与租户身份、代理 SSE/WSS、手机后台/恢复、凭证撤销和系统重启。
5. 完成部署记录后再开启 `VITE_PI_REMOTE_ENABLED`；保持当前“未通过”状态，直到上述证据齐备。
