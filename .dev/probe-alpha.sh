#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 主题的 quadImage（alpha 怎么传下去）==="
grep -n 'function quadImage' -A 16 themes/audio-archive/js/lib/*.js themes/audio-archive/js/*.js | head -22
echo
echo "=== 所有 DrawImage(..., alpha) 调用（看 alpha 的来源与范围）==="
grep -rhoE 'DrawImage\([^;]*\)' themes/audio-archive/js | grep -cE ',\s*(alpha|a|op|opacity|[0-9]+)\)$' || true
grep -rhoE 'DrawImage\([^;]{0,120}\)' themes/audio-archive/js | grep -E 'alpha|opacity|withAlpha' | head -8
echo
echo "=== rowAlpha 的定义（确认量纲）==="
grep -n 'function rowAlpha' -A 6 themes/audio-archive/js/archive.js
echo
echo "=== withAlpha 的定义 ==="
grep -rn 'function withAlpha' -A 6 themes/audio-archive/js/lib/*.js | head -10
