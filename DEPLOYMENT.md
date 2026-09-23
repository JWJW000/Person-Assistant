# 部署操作手册 (DEPLOYMENT.md)

## 1. 架构与前置要求
- **架构**: 手机端 (Tauri/Android) -> 反向代理 (HTTPS) -> Fastify 后端服务 -> 本地受控 12306 MCP 子进程。
- **环境要求**: Docker 24+, Docker Compose v2+，或直接 Node.js 22 LTS。

## 2. Docker Compose 部署步骤

1. **准备受控 12306-mcp 源码**:
   ```bash
   mkdir -p vendor
   git clone https://github.com/JWJW000/12306-mcp.git vendor/12306-mcp
   cd vendor/12306-mcp
   git checkout ff6439da6f63d7d72181abea4568abd69878c600
   npm install && npm run build
   cd ../..
   ```

## 3. Pi 远程任务

1. 为 Node 网关和若依配置相同的随机 `PI_INTERNAL_TOKEN`。若依使用 `PI_GATEWAY_URL` 访问固定内部地址；该地址和 `/internal/pi/*` 不应暴露到公网。
2. 代理公开 `/api/ai/pi/*`、`POST /runner/v1/pair` 和 `/runner/v1/connect`。Runner WebSocket 位置必须保留 `Upgrade` 请求头；SSE 必须关闭缓冲。
3. 登录 App，在“Pi 任务”中生成配对码，然后在目标机器执行：

   ```bash
   PI_GATEWAY_URL=https://assistant.example.com pnpm --filter @assistant/pi-runner pair -- 123456 "My Mac"
   ```

4. 编辑 `~/.pi-remote-runner/config.json` 的 `projects` 和可选 `models`。项目示例：

   ```json
   {
     "key": "assistant-handoff",
     "name": "Assistant Handoff",
     "path": "/absolute/path/to/assistant_handoff"
   }
   ```

5. `pnpm --filter @assistant/pi-runner build` 后使用 [systemd 模板](deploy/pi-runner.service) 或 [launchd 模板](deploy/com.personal-assistant.pi-runner.plist) 常驻。Runner 和 Pi 必须使用普通专用用户；允许项目目录不是文件系统沙箱，同 UID 的其他文件仍可被 Pi 工具访问。
6. 完成真实机验收后，以 `VITE_PI_REMOTE_ENABLED=true` 重建 App；默认值为 `false`。

当前生产版本为 Android 0.17.10。Node 网关只监听宿主机 127.0.0.1:3000，Java 容器通过 ai-network 访问 http://assistant-server:3000。Linux Runner 的配置与 compose 位于 /opt/pi-runner，使用 UID 1000；工作目录位于 /opt/pi-workspaces。正式配对必须使用用户确认的 App 账号。

若 Mac 的个人扩展阻止 RPC 启动，可为 Runner 指定专用 piExecutable 脚本，内容为 `exec /absolute/path/to/pi --no-extensions "$@"`。该模式提供基础 Pi 工具，不加载个人扩展。

Nginx 的 Runner 连接需要额外配置：

```nginx
location /runner/v1/connect {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Authorization $http_authorization;
}
```

上线前分别在 Mac、Linux 和真实手机完成 `docs/PI_REMOTE_IMPLEMENTATION_PLAN.md` 第 13 节验收。撤销机器会关闭连接并要求 Runner 停止受管进程；机器已离线时不能保证立即停止。备份网关 SQLite、Runner 状态目录、Pi 会话目录和项目代码，四者互不替代。

2. **配置环境变量**:
   参考 `server.env.example`，在服务器创建 `.env`。

3. **启动容器**:
   ```bash
   docker compose -f deploy/docker-compose.yml up -d
   ```

4. **初始化生成设备配对码**:
   ```bash
   docker compose -f deploy/docker-compose.yml exec server pnpm device:pair
   ```

5. **Nginx 反向代理配置示例**:
   ```nginx
   server {
       server_name assistant.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

           # 关键：支持 Server-Sent Events (SSE) 流式传输
           proxy_set_header Connection '';
           proxy_buffering off;
           proxy_cache off;
           chunked_transfer_encoding on;
       }
   }
   ```

## 安装包下载与缓存（0.17.8）

生产 Nginx 的 `/etc/nginx/sites-available/ai-portal` 和 `train.5wjw.cn` 均在通用 `/updates/` location 前增加以下 APK 规则；`latest.json` 仍沿用 `no-store`。版本 APK 发布后不可覆盖同名文件，内容变化必须提升版本号。缓存生效以完整 GET 后的 `CF-Cache-Status: HIT` 为准，不只检查浏览器缓存头。

```nginx
location ~ ^/updates/(personal-ai-assistant-v[0-9]+\.[0-9]+\.[0-9]+-aarch64\.apk)$ {
    alias /opt/assistant/updates/$1;
    default_type application/vnd.android.package-archive;
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Expose-Headers "Content-Length, Content-Range, ETag" always;
}
```

配置回退备份：`/opt/assistant/backups/update-cache-20260922-074516`。恢复后执行 `nginx -t`，通过后再 reload。

Android 下载器以版本文件名和 SHA-256 标识部分文件，通过 Range 续传；最多尝试 3 次，失败后保留进度，下次点击继续下载可恢复。服务器返回完整 200 时重新写入，异常 206/416 重置部分文件；SHA-256 校验通过后才把 `.part` 改为 `.apk`。旧清单没有 SHA-256 时禁用续传，仍进行完整下载及长度检查。0.17.8 安装完成后的后续更新才使用新下载器；缓存配置立即惠及旧版本。

可运行检查（JDK 17，无新增依赖）：`sh plugins/android-updater/tests/run.sh`。测试只监听本机临时端口，覆盖断流、跨调用续传、完整文件复用、200 回退、异常 206/416、校验失败与无哈希回退。没有 Android 真机，原生安装器交互未实测。

0.17.8 发布记录：versionCode `17008`；APK SHA-256 `e498c16ced1355f651b9611dda7db77fdecbb772300da869adeafb7a279a4523`。版本清单备份为 `/opt/assistant/backups/update-resume-20260922-075047/latest.json`。安装包已经从服务器经公网 HTTPS 完整下载两次，并与签名产物哈希核对；更新清单返回 `no-store`。JDK 下载故障回归与前端更新判断 4 项测试均通过，Android release 构建及签名验证通过。

### 2026-09-22 改为源站直连下载

用户已将 `train.5wjw.cn` 的 A 记录改为 DNS only，地址 `154.36.163.185`；公共 DNS 返回此地址，TTL 300 秒，无 AAAA 回答。安装包和更新清单 URL 保持不变，HTTPS 继续使用已有 Let's Encrypt 证书。服务器侧访问 `latest.json` 已返回 Nginx、HTTP 200、版本 0.17.8，无 CF-Ray；`ai.5wjw.cn` 保持原配置。之前的 CDN 命中记录仅表示切换前验收，当前 train 下载已绕过 Cloudflare；APK 长期缓存头仍保留供客户端使用。各客户端旧 DNS 缓存到期前可能短暂仍走原路径。

Mac 使用新解析地址（curl --resolve，未关闭 TLS 验证）完整下载 13,465,042 字节耗时 2.145 秒，均速约 6.28 MB/s；TLS 校验返回 0，连接 IP 为 154.36.163.185，APK SHA-256 与已发布清单一致，响应无 CF-Ray。该测速是本机当前网络样本，不代表手机所有网络的固定速度。

### Pi 消息发送框（0.17.9）

新输入框采用圆角输入区、自动增高的多行文本及圆形上箭头发送键；运行期间在底部切换调整当前/排队追加，停止保持独立操作。回车换行，Ctrl/Cmd+Enter 发送，输入法组合中不提交；提交中只读、失败保留内容、离线禁发。停止错误在输入区显示，停止不会清空草稿。

浏览器模拟接口验收覆盖 390×844 和 390×430，验证 prompt、steer、follow_up、stop 请求，runId、空白禁发、中文输入法、忙碌保护、失败草稿保留、离线状态、多行滚动和按钮可见性；API 与消息解析回归 3/3，移动端构建、Android release 构建及签名校验通过。未连接安卓真机，键盘布局使用缩小可视区域验证。

versionCode `17009`，APK SHA-256 `1c4087f384ed8ce240530ce63d781c159f4f5a3f8288c1ba03dd4dacd2b118f2`。更新清单备份：`/opt/assistant/backups/pi-composer-20260922-083156/latest.json`。下载地址：https://train.5wjw.cn/updates/personal-ai-assistant-v0.17.9-aarch64.apk 。

0.17.9 下载复核：服务器通过正式 HTTPS 域名完整下载 13,465,042 字节并验证哈希，响应来自 Nginx、无 CF-Ray。Mac 本次网络波动，默认 DNS 仍返回旧 CF IP；显式源站解析的本地下载也在 60 秒超时，均未用于完整性通过结论。版本清单与完整包校验结论基于服务器侧正式 HTTPS 入口，不承诺手机固定下载速度。

### 连续对话与整机管理（0.17.10）

对话 UI 改为首条消息自动创建会话和标题，后续使用同一 Pi 任务上下文；配置从右上角打开。默认输入区总高从 130px 降至 78px（文本区 44px，长内容最多 120px），用户消息靠右，AI 回复直接呈现 Markdown，表格横向滚动、代码块与全文可复制，工具输出默认折叠。流式状态随完成/失败/停止结束，切换会话后旧 SSE 回调不再更新当前会话。

全量测试 62/62 通过；浏览器 390×844、390×430 验证单行高度、代码/回复复制、首条创建及模型参数、失败保留并在原对话重试、排队/停止与小屏按钮可见。Android release 构建签名通过。versionCode `17010`，APK SHA-256 `bfd2e7b4ea22c1e80bfde26be703add4755d4a43dec8845d7534136559dbedd6`；服务器经正式直连 HTTPS 域名下载 13,469,138 字节，哈希一致、无 CF-Ray。更新清单备份：`/opt/assistant/backups/pi-chat-20260922-090239/latest.json`。

用户明确批准“专用持久 SSH 密钥 + 固定内网来源 + 宿主机 root”方案后，已部署 `assistant-pi-runner:0.17.10-admin`。Runner 仍以 UID 1000 在容器运行，固定地址 `172.20.0.6`，通过 `server-exec` 管理网关 `172.20.0.1` 的宿主机。密钥位于持久化 home 的 `.ssh/server-admin`（0600，UID 1000），known_hosts 固定主机公钥；root authorized_keys 使用 `restrict,from="172.20.0.6"`，保留原授权。没有新开公网端口或修改原有登录方式。全局 Pi 指导文件位于 `/opt/pi-runner/home/.pi/agent/AGENTS.md`，明确宿主机入口及中文简洁回复要求。

App admin 账号下已出现“云服务器管理”项目，ID `cbf15754-dff4-4711-be19-1944e73ee952`。真实 Pi 验收任务 `cc5df0d9-ddd9-4e60-b2f6-cc508a156632`，run `2acf3dd8-d4f3-4011-b64d-9978e5ad051e` 为 succeeded：模型实际调用 4 次 bash/server-exec，读取 root 身份、Docker 名称和状态、Nginx 语法及服务状态，并在宿主机 /tmp 写入 PI_SERVER_ADMIN_OK、读回、删除；零工具错误，临时文件已不存在。另一临时容器使用同一密钥时被 SSH 拒绝，验证来源限制生效。验收使用 admin 归属的内部网关接口，不代表已完成手机登录/SSE 真机验收。

权限与 Runner 配置备份：`/opt/assistant/backups/pi-server-admin-20260922-090619`。整机权限属于该服务器 Runner 的全部会话，项目目录不是主机权限隔离边界。维护与撤销入口见 [服务器管理说明](deploy/pi-server-admin/README.md)。

依赖审计：官方 npm 端点返回 0 high/critical、2 moderate，均为 Vitest/@vitest/mocker 的 GHSA-82fw-gwwq-j7x9，涉及浏览器测试 mock 路由，未部署为 App 或生产网关服务；本次无新增 npm 依赖。升级至 Vitest >=4.1.11 涉及跨主版本开发工具升级，纳入开发依赖维护，复核日期 2026-10-06。镜像源 npmmirror 不提供审计端点，审计通过命令行临时指定官方 registry 完成，未改动项目 registry 配置。
