#!/usr/bin/env bash
# 最终验证：重置到参考状态 → 状态+几何+截图
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\seed-wipe.js' >/dev/null
node cdp.js nav - "http://127.0.0.1:8300/?demo=1&final=1" >/dev/null
sleep 16
echo "=== 参考状态 ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\sel-check.js'
echo
echo "=== 几何锚点 ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\lib-keys.js' | grep -A8 '"geom"'
echo
echo "=== 最终截图 ==="
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\final-verify.png'
