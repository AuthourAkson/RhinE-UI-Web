#!/usr/bin/env bash
# 改完 serve.mjs 后的回归验证：页面能启动、面板有尺寸、状态正确
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
echo "=== HTTP 检查 ==="
curl -s -o /dev/null -w 'index: %{http_code}\n' http://127.0.0.1:8300/
curl -s -o /dev/null -w 'manifest: %{http_code}\n' http://127.0.0.1:8300/__manifest.json
curl -s -o /dev/null -w 'music: %{http_code}\n' http://127.0.0.1:8300/__music.json
echo
echo "=== 浏览器启动验证 ==="
node cdp.js nav - "http://127.0.0.1:8300/?demo=1&start=1" >/dev/null
sleep 16
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\all-frames.js' | head -22
echo
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\sel-check.js' | head -8
