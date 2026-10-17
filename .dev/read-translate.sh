#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== lib/translate.js 全文（应该不大）==="
cat themes/audio-archive/js/lib/translate.js
echo
echo "=== 设置项关键字 ==="
grep -rn 'translate' themes/audio-archive/js/*.js themes/audio-archive/js/lib/*.js | grep -i 'getSetting\|setSetting\|PROVIDER\|target\|key' | head -14
echo
echo "=== 默认设置文件里有没有 translate 相关 ==="
grep -o '"[a-zA-Z]*ranslate[a-zA-Z]*"[: ]*[^,}]*' audio-archive-settings.json | head -10
