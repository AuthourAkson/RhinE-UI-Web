#!/usr/bin/env bash
# 确保有可用的 headless Chrome（端口 9226），没有就拉起
set -u
CDP=${CDP_PORT:-9226}
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
PROF_W='D:\AgentTestLab\RhinE-UI\.dev\chrome-profile'
mkdir -p '/d/AgentTestLab/RhinE-UI/.dev/chrome-profile'
if curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$CDP/json/version"; then
  echo "  Chrome 已在运行（端口 $CDP）"
else
  echo "  启动 Chrome（headless=new，端口 $CDP）"
  "$CHROME" --remote-debugging-port=$CDP --user-data-dir="$PROF_W" \
    --no-first-run --no-default-browser-check --headless=new --no-proxy-server \
    --window-size=1600,1000 --hide-scrollbars about:blank >/dev/null 2>&1 &
  sleep 7
  curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$CDP/json/version" && echo "  ✅ 已就绪"
fi
