#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== bindEvents 全貌 ==="
grep -n 'function bindEvents' -A 46 shim/shim.js
echo
echo "=== 鼠标坐标换算 / canvas 事件目标 ==="
grep -n "addEventListener('mouse\|addEventListener(\"mouse\|addEventListener('contextmenu\|addEventListener('wheel\|getBoundingClientRect" shim/shim.js | head -20
