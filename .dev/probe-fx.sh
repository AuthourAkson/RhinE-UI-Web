#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 宿主里 fx / 开场影片相关 ==="
grep -n "fx" app.js | grep -viE "prefix|suffix" | head -18
echo
echo "=== 主题 fx.js 里影片结束时做什么 ==="
grep -n 'send(\|Show(\|FIN\|done\|end' themes/audio-archive/js/fx.js | head -16
echo
echo "=== 宿主里面板显示/隐藏的实现 ==="
grep -n "Show\b\|Move\b" app.js | head -12
