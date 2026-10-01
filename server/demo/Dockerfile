# 体验版临时镜像（01 章第 5 节「备案期间过渡」之前的零成本方案，2026-10-03 用户确认）：
# 后台和 PostgreSQL 装在同一个容器里，构建时建表并写入种子数据；容器重启后数据回到种子数据。
# 只能单实例运行（云托管最大副本数 1）。搬到阿里云后删除本目录。
# 构建上下文是临时目录：本文件 + 仓库源码打成的 src.tar.gz。
# 打包是因为 tcb CLI 上传时会跳过所有名叫 logs 的目录（server/src/modules/logs 会丢）。
FROM node:24-alpine
WORKDIR /repo

# 国内构建机拉 Alpine 和 npm 包慢，换腾讯云镜像
RUN sed -i 's#https\?://dl-cdn.alpinelinux.org#https://mirrors.cloud.tencent.com#g' /etc/apk/repositories \
  && apk add --no-cache postgresql17 postgresql17-client su-exec
ENV COREPACK_NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm \
  npm_config_registry=https://mirrors.cloud.tencent.com/npm/
RUN corepack enable

# ADD 会自动解开本地的 tar.gz
ADD src.tar.gz ./
RUN pnpm install --frozen-lockfile && pnpm --filter @huazhong/server build

ENV PGDATA=/var/lib/postgresql/data \
  DATABASE_URL=postgres://huazhong@127.0.0.1:5432/huazhong \
  NODE_ENV=production \
  PORT=8080

# 建库、跑迁移、写种子数据，打进镜像，冷启动不用再等
RUN mkdir -p "$PGDATA" /run/postgresql \
  && chown -R postgres:postgres /var/lib/postgresql /run/postgresql \
  && su-exec postgres initdb -U huazhong --auth=trust -E UTF8 >/dev/null \
  && su-exec postgres pg_ctl -w -o "-c listen_addresses=127.0.0.1" start \
  && su-exec postgres createdb -U huazhong huazhong \
  && (cd server && node dist/db/seed/run.js) \
  && su-exec postgres pg_ctl -w stop

RUN cp server/demo/start.sh /start.sh && chmod +x /start.sh
EXPOSE 8080
CMD ["/start.sh"]
