#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== archive.js 480-520（用 Effect 的那段）==="
sed -n '480,520p' themes/audio-archive/js/archive.js
echo
echo "=== 所有 'clear' 出现处 ==="
grep -n 'clear' themes/audio-archive/js/archive.js | head -30
echo
echo "=== frost / hero 相关 ==="
grep -rn 'frost\|hero\|FROST' themes/audio-archive/js/*.js themes/audio-archive/js/lib/*.js | head -20
