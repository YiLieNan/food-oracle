# ── 食神签 · Docker 镜像 ────────────────────
FROM node:20-alpine

# 安装 better-sqlite3 需要的编译工具
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 复制源码
COPY server.js ./
COPY *.html ./

# 数据持久化目录
VOLUME /app/data
ENV DB_PATH=/app/data/food_oracle.db
ENV PORT=3456

EXPOSE 3456

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3456/api/health').then(r=>r.ok?process.exit(0):process.exit(1))"

CMD ["node", "server.js"]
