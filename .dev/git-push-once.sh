#!/usr/bin/env bash
# 一次性推送（带 90 秒超时）：GCM 有时会卡住，卡了就明确报出来
cd /d/AgentTestLab/RhinE-UI || exit 1
export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897
export GIT_TERMINAL_PROMPT=0
echo "推之前: 本地 $(git rev-parse --short HEAD)  远端记录 $(git rev-parse --short origin/main)"
timeout 90 git push origin main 2>&1 | tail -4
rc=${PIPESTATUS[0]}
echo "git push 退出码: $rc  （124 = 超时，说明 GCM 又卡住了）"
echo "推之后: 远端记录 $(git rev-parse --short origin/main)"
