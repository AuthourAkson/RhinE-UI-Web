#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 主题里 DrawEffect / Effect 的用法 ==="
grep -rn 'DrawEffect\|d2d.Effect\|Effect(' themes/audio-archive/js | head -14
echo
echo "=== archive.js 里选中/淡出相关的量 ==="
grep -nE 'SEL|sel[A-Za-z]*|fade|alpha|opacity|k =|tweenK|Tween' themes/audio-archive/js/archive.js | head -34
