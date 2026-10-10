#!/usr/bin/env bash
# 运行布局对比器
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\layout-compare.js'
