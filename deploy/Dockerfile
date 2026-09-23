FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

# 安装构建原生依赖所需工具 (better-sqlite3)
RUN apk add --no-cache python3 make g++ gcc

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/
COPY apps/pi-runner/ ./apps/pi-runner/

RUN pnpm install --frozen-lockfile
RUN pnpm -r --filter=!@assistant/mobile build

# 运行镜像
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache dumb-init bash git ripgrep

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/assistant.sqlite

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/server/ ./apps/server/
COPY --from=builder /app/apps/pi-runner/ ./apps/pi-runner/

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "apps/server/dist/index.js"]
