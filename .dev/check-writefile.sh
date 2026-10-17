#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== shim 里的文件类 utils ==="
grep -n 'WriteTextFile\|ReadTextFile\|IsFile\|CreateFolder\|DeleteFile' shim/shim.js | head -12
echo
echo "=== 主题翻译模块用到的 utils 方法 ==="
grep -oE 'utils\.[A-Za-z_]+' themes/audio-archive/js/lib/translate.js | sort -u
echo
echo "=== 设置文件里的 lyrics / tr 相关 ==="
grep -o '"lyrics[A-Za-z]*"[[:space:]]*:[[:space:]]*[^,}]*' audio-archive-settings.json | head
grep -o '"tr[A-Za-z]*"[[:space:]]*:[[:space:]]*[^,}]*' audio-archive-settings.json | head
