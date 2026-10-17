#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== lyrics.js 里翻译相关（入口/触发条件）==="
grep -n 'TR\b\|trSettings\|trStart\|translate\|bilingual\|\.b\b' themes/audio-archive/js/lib/lyrics.js | head -30
echo
echo "=== 谁调用翻译的启动函数 ==="
grep -rn 'trStart\|startTranslate\|trSettings()' themes/audio-archive/js/*.js themes/audio-archive/js/lib/*.js | head -12
