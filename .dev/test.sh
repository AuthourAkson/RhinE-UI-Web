#!/usr/bin/env bash
# 全流程测试：重载页面 → 收面板状态 → 截图
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
node cdp.js nav - "http://127.0.0.1:8300/?t=$(date +%s)"
sleep 11
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\probe1.js'
echo "--- 根面板内省 ---"
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\probe2.js'
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\shot1.png'
