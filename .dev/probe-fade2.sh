#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== fadedSprite 的调用点 ==="
grep -n 'fadedSprite' themes/audio-archive/js/archive.js
echo
echo "=== 调用点上下文 ==="
n=$(grep -n 'fadedSprite(' themes/audio-archive/js/archive.js | head -1 | cut -d: -f1)
sed -n "$((n-26)),$((n+20))p" themes/audio-archive/js/archive.js
echo
echo "=== Spring / stepSpring 定义（看动画推进）==="
grep -n 'function Spring\|function stepSpring' -A 12 themes/audio-archive/js/lib/motion.js | head -32
