# Pi 远程任务使用说明

已绑定账号：admin。建议更新 App 至 0.17.10。

## 在 App 使用

登录 admin → 打开会话侧栏 → Pi 对话 → 选择「我的 Mac Pi」或「我的服务器 Pi」→ 新对话 → 直接发送要求。右上角可选择机器、项目与模型，对话标题自动从第一条消息生成。机器与模型使用底部选择面板，模型支持搜索；切换机器后项目和模型会重新加载。

| 机器 | 项目 | 实际目录 |
| --- | --- | --- |
| 我的 Mac Pi | Mac 任务工作区 | /Users/jiangyinhe/PiProjects |
| 我的 Mac Pi | Mac 助手项目 | /Users/jiangyinhe/workPlace/assistant_handoff |
| 我的服务器 Pi | 云服务器管理 | 通过专用 SSH 以 root 操作真实宿主机；操作工作区 /workspace/server-admin |
| 我的服务器 Pi | 服务器任务工作区 | 宿主机 /opt/pi-workspaces/tasks；容器 /workspace/tasks |
| 我的服务器 Pi | 服务器助手项目 | 宿主机 /opt/pi-workspaces/assistant_handoff；容器 /workspace/assistant_handoff |

每个项目同时执行一个任务；可在同任务中继续对话、调整或追加。两台机器的文件互相独立，服务器助手项目是部署时复制的源码，不自动同步 Mac 文件。

输入区右下角的上箭头发送消息；Pi 运行中，可在输入框左侧图标切换「调整当前」或「排队追加」，方形按钮停止执行。回车换行，外接键盘可用 Ctrl/Cmd+Enter 发送；发送失败会保留草稿。

## 管理云服务器

选择「我的服务器 Pi」和「云服务器管理」，直接用自然语言提出目标，例如“检查 Nginx 和 Docker 状态”“查看这个服务最近的错误日志”“帮我部署这个项目”。Pi 已配置主机命令入口 `server-exec`，支持 Docker、Nginx、软件安装与系统服务管理。操作的是实际宿主机，不只是在容器里执行命令。

该能力已按用户明确授权配置为 root 权限，专用密钥只接受 Runner 固定内网 IP，并校验主机公钥。当前服务器 Runner 的所有会话都能使用这个入口。密钥与回退维护见 [服务器管理说明](../deploy/pi-server-admin/README.md)。

## 重启与重连

- Mac 重启后，登录 jiangyinhe 用户并联网，launchd 自动启动 Runner；无需打开终端、手动执行 Pi 或重新配对。
- Mac 睡眠、关机或未登录时，本机暂时不可用；唤醒并联网后自动重连。需要持续运行的任务可选择服务器。
- 服务器 Pi 已安装在非 root Docker 容器中，Docker 开机启动，Runner 自动重启。当前 Runner 镜像为 assistant-pi-runner:0.17.10-admin，包含容器重启后的陈旧 PID 锁恢复修复。
- 重启时正在执行的任务会标记为中断，确认机器在线后在 App 中继续；不会自动重放不确定的文件操作。
- 当前机器凭据到期日为 2026-12-21，到期或撤销后需要重新配对。

## 维护

Mac 配置：`~/.pi-remote-runner/config.json`；日志：`~/.pi-remote-runner/runner.err`。配置含敏感机器凭据，不要分享。

Mac 自启动文件：`~/Library/LaunchAgents/com.personal-assistant.pi-runner.plist`。

```bash
launchctl print gui/$(id -u)/com.personal-assistant.pi-runner
launchctl kickstart -k gui/$(id -u)/com.personal-assistant.pi-runner
```

服务器配置：`/opt/pi-runner/state/config.json`；模型与会话：`/opt/pi-runner/home/.pi/agent`。

```bash
cd /opt/pi-runner
docker compose ps
docker compose logs --tail 50 runner
docker compose restart runner
```

Mac 使用现有 Pi 和模型配置；因个人扩展存在依赖/工具冲突，远程专用入口使用 `--no-extensions`。服务器默认模型为 gemini-3.8-flash-high。

Mac Runner 当前程序位于 assistant_handoff 仓库，Node 位于 ~/.nvm/versions/node/v22.22.0。移动仓库或删除该 Node 版本后，需同步修改 launchd 的路径。
