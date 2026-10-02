#!/bin/sh
set -eu

REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
STAGE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/huazhong-demo.XXXXXX")
trap 'rm -rf "$STAGE_DIR"' EXIT HUP INT TERM

cd "$REPO_DIR"
SERVICE_NAME=$(node -e 'const fs = require("node:fs"); const config = JSON.parse(fs.readFileSync("cloudbaserc.json", "utf8")); if (!config.cloudrun?.name) throw new Error("cloudrun.name is required"); process.stdout.write(config.cloudrun.name)')
# Archive source before CLI upload so modules/logs survives its directory filters.
COPYFILE_DISABLE=1 tar -czf "$STAGE_DIR/src.tar.gz" \
  --exclude=node_modules --exclude=dist --exclude=coverage \
  --exclude='*.tsbuildinfo' --exclude='.env*' --exclude='.DS_Store' \
  --exclude=miniprogram_npm --exclude=project.private.config.json \
  --exclude=miniapp/miniprogram/config/env.ts --exclude=scripts/.cache \
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json \
  shared server miniapp scripts
cp server/demo/Dockerfile "$STAGE_DIR/Dockerfile"
cp cloudbaserc.json "$STAGE_DIR/cloudbaserc.json"

tcb cloudrun deploy --service-name "$SERVICE_NAME" --source "$STAGE_DIR" --port 8080 --force "$@"
