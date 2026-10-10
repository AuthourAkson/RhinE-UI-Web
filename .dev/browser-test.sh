#!/usr/bin/env bash
# 用 CDP 打开 RhinE-UI，收集面板状态并截图
set -u
CDP=${CDP_PORT:-9226}
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
PROF_B='/d/AgentTestLab/RhinE-UI/.dev/chrome-profile'
PROF_W='D:\AgentTestLab\RhinE-UI\.dev\chrome-profile'
PROBE_W='D:\AgentTestLab\RhinE-UI\.dev\probe1.js'
SHOT_W='D:\AgentTestLab\RhinE-UI\.dev\shot1.png'

mkdir -p "$PROF_B"
if ! curl -s -o /dev/null "http://127.0.0.1:$CDP/json/version"; then
  echo "  启动 Chrome（headless=new，端口 $CDP）"
  "$CHROME" --remote-debugging-port=$CDP --user-data-dir="$PROF_W" \
    --no-first-run --no-default-browser-check --headless=new --no-proxy-server \
    --window-size=1600,1000 --hide-scrollbars about:blank >/dev/null 2>&1 &
  sleep 7
fi

export CDP_PORT=$CDP
cd '/d/Skill实验室/tools' || exit 1
echo "  --- 打开页面 ---"
node cdp.js nav - "http://127.0.0.1:8300/"
sleep 10
echo "  --- 面板状态 ---"
node cdp.js eval - "$PROBE_W"
echo "  --- 截图 ---"
node cdp.js shot - "$SHOT_W"
