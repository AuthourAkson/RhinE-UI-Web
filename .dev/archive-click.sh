#!/usr/bin/env bash
# 复现：档案视图里点击外壳 → 看选中状态与画面
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1

echo "=== 重载（demo 曲库） ==="
node cdp.js nav - "http://127.0.0.1:8300/?demo=1&click=$(date +%s)" >/dev/null
sleep 16
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\goto-archive.js'
sleep 4
echo "--- 点击前 ---"
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\archive-state.js'
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\arc-before.png' >/dev/null

echo ""
echo "=== 点击货架上第一张外壳（约 400,560） ==="
node cdp.js clickxy - 400 560
sleep 4
echo "--- 点击后 ---"
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\archive-state.js'
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\arc-after.png' >/dev/null
