#!/usr/bin/env bash
# 验证 PLAY 修复：150% 缩放下点卡片播放 + 检查播放列表被正确装载
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
node --check app.js && node --check shim/shim.js && echo "语法 OK" || exit 1
export CDP_PORT=${CDP_PORT:-9226}
node .dev/click-150.mjs
