#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== shim 里 setLook 的实现（会不会重跑 boot）==="
grep -n 'setLook' -A 22 shim/shim.js | head -34
echo
echo "=== panel.html 里的脚本注入是否有防重复 ==="
cat panel.html
