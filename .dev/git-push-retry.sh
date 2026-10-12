#!/usr/bin/env bash
# 推送重试：本机到 github 的链路时通时断（SSL_ERROR_SYSCALL / GCM 卡住），最多试 5 次，每次 60 秒超时
cd /d/AgentTestLab/RhinE-UI || exit 1
export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897
export GIT_TERMINAL_PROMPT=0
echo "目标: 把 $(git rev-parse --short HEAD) 推到 origin/main（当前远端记录 $(git rev-parse --short origin/main)）"
for i in 1 2 3 4 5; do
  echo "--- 第 $i 次 ---"
  out=$(timeout 60 git push origin main 2>&1); rc=$?
  if [ $rc -eq 0 ]; then
    printf '%s\n' "$out" | tail -3
    echo "推送成功 ✓  远端记录 = $(git rev-parse --short origin/main)"
    exit 0
  fi
  printf '%s\n' "$out" | grep -E 'fatal|error|rejected|SSL|timed out' | head -2
  echo "  退出码 $rc（124=超时/GCM 卡住，128=网络错误），等 6 秒再试"
  sleep 6
done
echo "5 次都没成功 ✗  远端记录仍为 $(git rev-parse --short origin/main)"
exit 1
