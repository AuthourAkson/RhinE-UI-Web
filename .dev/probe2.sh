#!/usr/bin/env bash
# 只跑内省探针（假定服务器与 Chrome 已在跑）
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\probe2.js'
