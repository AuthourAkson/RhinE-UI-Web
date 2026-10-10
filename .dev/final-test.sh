#!/usr/bin/env bash
# 接上真实标签解析器后的完整验证：曲库 + 封面 + 档案视图截图
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1

echo "=== 重载（demo 曲库 + 真实标签解析） ==="
node cdp.js nav - "http://127.0.0.1:8300/?demo=1&tags=$(date +%s)"
sleep 16
echo "--- 曲库状态 ---"
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\lib-state.js'

echo ""
echo "=== 等封面生成后再看一次 ==="
sleep 6
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\lib-state.js' | grep -E 'themeThumbs|liveErrors|catalog' 

echo ""
echo "=== 档案视图截图 ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\goto-archive.js' >/dev/null
sleep 5
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\final-archive.png'
