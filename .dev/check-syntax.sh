#!/usr/bin/env bash
# 语法检查
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
node --check shim/shim.js && echo "OK shim.js"
node --check app.js && echo "OK app.js"
node --check serve.mjs && echo "OK serve.mjs"
