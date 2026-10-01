# 微信云托管镜像（01 章第 5 节）。在仓库根目录构建：docker build -f server/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @huazhong/server... \
  && pnpm --filter @huazhong/server build \
  && pnpm --filter @huazhong/server deploy --prod /app

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=80
COPY --from=build /app ./
EXPOSE 80
CMD ["node", "dist/src/main.js"]
