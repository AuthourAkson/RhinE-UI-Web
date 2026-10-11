#!/usr/bin/env bash
# dpr=1 回归检查（修复在 dpr=1 下应当等价于旧行为）
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
node cdp.js nav - "http://127.0.0.1:8300/?demo=1&dpr1=1" >/dev/null
sleep 17
echo "=== 面板尺寸（应全部正常）==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\all-frames.js' | grep -E '"frame"|"themeWH"' | head -20
echo
echo "=== 主题几何 ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\lib-keys.js' | grep -A9 '"geom"'
echo
echo "=== ALBUMS/TRACKS 状态 ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\sel-check.js' | head -6
