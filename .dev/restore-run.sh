#!/usr/bin/env bash
# 还原完整演示曲库 + 验证 ALBUMS / TRACKS 两种模式的传送带内容
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
node .dev/restore-library.sh 2>&1 | tail -5
export CDP_PORT=${CDP_PORT:-9226}
curl -s http://127.0.0.1:8300/__rebuild >/dev/null && echo "清单已重建"
