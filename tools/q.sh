#!/usr/bin/env bash
# 安静地跑 pnpm 脚本：完整日志写到 /tmp/hz-logs/，终端只给结论和失败摘要。
# 用法：tools/q.sh check    tools/q.sh test:ui:stage4    tools/q.sh test -- server/xxx.test.ts
set -u
name="$1"
shift
dir=/tmp/hz-logs
mkdir -p "$dir"
log="$dir/${name//[:\/]/-}.log"
start=$(date +%s)
pnpm run "$name" "$@" >"$log" 2>&1
code=$?
secs=$(($(date +%s) - start))
if [ "$code" -eq 0 ]; then
  echo "通过：pnpm ${name}（${secs}s），日志 ${log}"
  grep -E 'Test Files|Tests +[0-9]' "$log" | tail -2
else
  echo "失败：pnpm ${name} 退出码 ${code}（${secs}s），日志 ${log}"
  grep -nE 'error|Error|FAIL|failed|✗|×|ERR_' "$log" | grep -v node_modules | head -40
  echo "--- 日志末尾 ---"
  tail -15 "$log"
fi
exit "$code"
