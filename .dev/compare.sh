#!/usr/bin/env bash
# 把档案视图切到与原版参考图相同的模式：SHOW=ALBUMS、GROUP=NONE，然后截图对比
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1

echo "=== 重载 + 档案视图 ==="
node cdp.js nav - "http://127.0.0.1:8300/?demo=1&cmp=$(date +%s)" >/dev/null
sleep 16
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\goto-archive.js'
sleep 4

echo "--- 当前工具栏状态 ---"
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\toolbar-state.js'

echo ""
echo "=== 点 SHOW=ALBUMS（约 746,104）==="
node cdp.js clickxy - 746 104
sleep 2
echo "=== 点 GROUP=NONE（约 727,138）==="
node cdp.js clickxy - 727 138
sleep 3
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\toolbar-state.js'
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\cmp-albums.png' >/dev/null
echo "已截图 cmp-albums.png"
