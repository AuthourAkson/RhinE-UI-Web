#!/usr/bin/env bash
# 拾取器测试：Alt+点击工具栏的 GROUP 按钮，看是否报告出正确的面板/坐标/命中区
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
node cdp.js nav - "http://127.0.0.1:8300/?demo=1&pick=$(date +%s)" >/dev/null
sleep 15
cd /d/AgentTestLab/RhinE-UI || exit 1
node .dev/pick-test.mjs
