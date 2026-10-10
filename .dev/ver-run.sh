#!/usr/bin/env bash
# 查每个面板里加载的是哪一版 shim，以及谁在真正渲染
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
node cdp.js nav - "http://127.0.0.1:8300/?demo=1&ver=$(date +%s)" >/dev/null
sleep 15
echo "=== root / stage 面板的 shim 版本与画布 ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\root-probe.js'
echo ""
echo "=== 拾取器端到端：Alt+点击 root 面板（可见的那个）==="
cd /d/AgentTestLab/RhinE-UI || exit 1
node .dev/pick-test2.mjs
