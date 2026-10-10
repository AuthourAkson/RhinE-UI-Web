#!/usr/bin/env bash
# 工具栏点击实测：重载 → 等就绪 → mousemove 扫描命中区 → 逐个点击验证状态变化
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
node cdp.js nav - "http://127.0.0.1:8300/?demo=1&tb=$(date +%s)" >/dev/null
sleep 16
cd /d/AgentTestLab/RhinE-UI || exit 1
node .dev/toolbar-test.mjs
