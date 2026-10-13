#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== demo 按钮的定位逻辑 ==="
grep -n 'rhine-demo-btn' -B4 -A26 app.js | head -60
echo
echo "=== 还有哪些宿主 UI 是按主题坐标定位的（position:fixed/absolute + style.left/top）==="
grep -n "\.style\.left\|\.style\.top\|position *= *'fixed'\|position:fixed" app.js | head -20
