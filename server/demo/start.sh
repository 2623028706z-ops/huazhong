#!/bin/sh
# 体验版容器启动：先起容器内的 PostgreSQL，再起后台（说明见同目录 Dockerfile）
set -eu

su-exec postgres pg_ctl -w -o "-c listen_addresses=127.0.0.1" start

# 管理员手机号从云托管环境变量 HZ_DEMO_ADMIN_PHONE 读，不进仓库；
# 用来让真实微信号在登录页用手机号快速验证绑定到种子里的管理员
if [ -n "${HZ_DEMO_ADMIN_PHONE:-}" ]; then
  echo "UPDATE accounts SET phone = :'phone' WHERE type = 'admin';" \
    | psql -q -v ON_ERROR_STOP=1 -v phone="$HZ_DEMO_ADMIN_PHONE" "$DATABASE_URL"
  # 只记有没有改，不打印号码
  echo "demo: admin phone applied"
fi

cd /repo/server
exec node dist/src/main.js
