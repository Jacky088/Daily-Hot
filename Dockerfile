# 使用更小的基础镜像和多阶段构建来减少最终镜像的大小
FROM node:lts-alpine AS builder

# 设置工作目录，避免之后的 RUN 命令中需要不断地 mkdir 和 cd
WORKDIR /app

# 设置 node 环境变量为生产环境，不会安装 devDependencies
ENV NODE_ENV=production

# 复制项目依赖文件，这里优化了复制步骤，可以利用 Docker 缓存
COPY package.json pnpm-lock.yaml* ./

# 启用 corepack 并预先下载 pnpm 包管理器，减少运行时下载延迟
# 安装项目依赖，使用 --frozen-lockfile 参数确保锁文件的准确性
RUN corepack enable && corepack prepare --activate && pnpm install --prod --frozen-lockfile

# 复制项目代码到工作目录
COPY . .

# 运行阶段
FROM node:lts-alpine AS runner

# 维护信息
LABEL maintainer="木木"
LABEL description="🔥 每日热榜 · 一站看完天下事 · 基于 60s API 构建的一站式热榜聚合面板"

# 设置工作目录
WORKDIR /app

# 设置 node 环境变量为生产环境，更高效地运行应用，设置时区为上海
ENV NODE_ENV=production TZ=Asia/Shanghai

# 创建一个运行用户，避免以 root 用户运行
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# 从构建阶段复制整个 app 目录
COPY --from=builder /app .

# 切换到非 root 用户
USER nodejs

# 指定暴露端口
EXPOSE 4399

# 健康检查：alpine 自带 busybox wget，无需额外安装 curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:4399/health || exit 1

# 运行应用
CMD ["node", "node.ts"]
