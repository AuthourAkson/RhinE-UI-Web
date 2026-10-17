#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 谁调用 translateLyrics ==="
grep -rn 'translateLyrics(' themes/audio-archive/js/*.js themes/audio-archive/js/lib/*.js
echo
echo "=== 调用点上下文 ==="
n=$(grep -rn 'translateLyrics(' themes/audio-archive/js/*.js | grep -v 'function translateLyrics' | head -1 | cut -d: -f2)
f=$(grep -rln 'translateLyrics(' themes/audio-archive/js/*.js | head -1)
echo "文件: $f  行: $n"
[ -n "$n" ] && sed -n "$((n-14)),$((n+8))p" "$f"
echo
echo "=== translate.js 是怎么被 include 的 ==="
grep -rn 'translate.js' themes/audio-archive/js/*.js themes/audio-archive/js/lib/*.js | head -5
echo
echo "=== 构建清单里 stage 面板的脚本顺序是否包含 translate.js ==="
node -e "const m=require('./dist/__manifest.json'); const s=m.scripts.stage||[]; console.log('stage 脚本数:', s.length); console.log(s.filter(x=>/translate|lyrics/i.test(x)).join('\n') || '  ✗ 没有 translate/lyrics 相关脚本');"
