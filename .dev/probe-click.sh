#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 主题 hits 的 API 定义 ==="
grep -rn 'const hits\|let hits\|function setHit\|function hit(\|hits.set' themes/audio-archive/js/lib/*.js themes/audio-archive/js/*.js | head -10
echo
echo "=== archive.js 里点击是如何生效的 ==="
grep -n 'on_mouse_lbtn_up\|on_mouse_lbtn_down\|AR.hover\|hover' themes/audio-archive/js/archive.js | head -20
echo
echo "=== stage.js 里 2D/3D 切换的命中处理（用来做触摸诊断的更稳目标）==="
sed -n '474,484p' themes/audio-archive/js/stage.js
