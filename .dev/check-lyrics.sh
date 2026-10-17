#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 主题 lyrics 里与"翻译/双语"相关的代码 ==="
grep -rn 'trans\|bilingual\|双语\|zh-CN\|LYR_TR\|translation' themes/audio-archive/js/lyrics.js | head -20
echo
echo "=== lyrics.js 里解析 LRC 的函数 ==="
grep -n 'function parse\|function lyricsLoad\|lrcLine\|\[.*\\d\+:.*\\d' themes/audio-archive/js/lyrics.js | head -12
echo
echo "=== 现有 lrc 文件 ==="
ls -la musiclab/*.lrc 2>/dev/null
echo
echo "=== 那个 lrc 的前 24 行（看有没有中英双行）==="
for f in musiclab/*.lrc; do echo "--- $f ---"; head -24 "$f"; done
