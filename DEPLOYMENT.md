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
