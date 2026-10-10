#!/usr/bin/env bash
# 拾取器端到端验证
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd /d/AgentTestLab/RhinE-UI || exit 1
node .dev/pick-test2.mjs
