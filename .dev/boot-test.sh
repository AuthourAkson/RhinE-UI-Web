#!/usr/bin/env bash
# 验证：启动即自动播放开场影片，播完进入界面
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
PROBE='D:\AgentTestLab\RhinE-UI\.dev\click-probe.js'

echo "=== 重载页面（不点任何东西，观察是否自动播开场） ==="
node cdp.js nav - "http://127.0.0.1:8300/?boot=$(date +%s)"
sleep 4
echo "--- T+4s ---"
node cdp.js eval - "$PROBE" | grep -E 'fxKind|rootView|recentErrors'
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\boot-auto-1.png' >/dev/null

sleep 2
echo "--- T+6s ---"
node cdp.js eval - "$PROBE" | grep -E 'fxKind'
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\boot-auto-2.png' >/dev/null

sleep 2
echo "--- T+8s ---"
node cdp.js eval - "$PROBE" | grep -E 'fxKind'
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\boot-auto-3.png' >/dev/null

sleep 6
echo "--- T+14s（应该已进入界面） ---"
node cdp.js eval - "$PROBE" | grep -E 'fxKind|rootView|hud|recentErrors'
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\boot-auto-4.png' >/dev/null
echo "截图：boot-auto-1..4.png"
