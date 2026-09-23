# 云服务器整机管理（已部署）

2026-09-22 用户明确确认持久 root SSH 方案后已部署。Runner 镜像为 `assistant-pi-runner:0.17.10-admin`，容器保持 UID 1000，通过专用 SSH 密钥管理宿主机。备份目录：`/opt/assistant/backups/pi-server-admin-20260922-090619`。

实际配置：

- 在原 Runner 镜像上增加 OpenSSH 客户端及 `server-exec`；容器仍以 UID 1000 运行。
- 为 Runner 固定现有内网地址 `172.20.0.6`，`pi-server` 指向网桥网关 `172.20.0.1`。
- 在服务器 `/opt/pi-runner/home/.ssh/` 生成专用 Ed25519 密钥，目录 0700、私钥 0600、所有者 1000；不把私钥发送到 App、仓库或输出日志。
- 在宿主机 root 的 authorized_keys 增加独立条目：`restrict,from="172.20.0.6"`。保留现有条目。只允许这个来源使用该密钥，禁用该密钥的端口转发、代理转发和 PTY。
- 使用服务器已有 SSH 主机公钥生成专用 known_hosts，StrictHostKeyChecking=yes；不修改现有密码登录策略或防火墙，不新增公网端口。
- 该入口具有宿主机 root 的完整文件及服务权限；网络来源限制不等于命令白名单，Pi 仍可修改或删除整机内容。
- 注册“云服务器管理”工作区并安装本目录的 AGENTS.md，让 Pi 明确区分容器与宿主机。操作过程通过 Pi 任务事件记录。
- 只在确认没有活动任务后重启 Runner，验证回连、主机身份、Docker/Nginx 状态；用临时测试文件验证写入和清理，不重启业务服务。

部署前备份 Runner compose、配置、指导文件和 root authorized_keys。回退时先移除这条专用授权，再恢复旧镜像与配置；保留业务数据和 Pi 会话。

机器归属仍为 App 的 admin 账号。整机操作权限属于这个服务器 Runner 的全部会话，项目选择用于区分工作目录，不是主机命令的权限边界。撤销整机操作入口时，删除 root authorized_keys 中注释为 `pi-app-server-admin` 的专用条目，并移除专用私钥；不要删除其他授权。只撤销 App 的机器绑定不会同时删除 SSH 授权。

真实验收任务“云服务器管理验收”已成功，模型通过 server-exec 完成 root 身份、Docker/Nginx 状态与临时文件读写清理；其他容器来源使用同一密钥被拒绝。
