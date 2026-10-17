#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 主题里画歌词的文件与翻译处理 ==="
ls themes/audio-archive/js/*.js | head -20
echo
grep -rln 'LYR\|lyric' themes/audio-archive/js/*.js themes/audio-archive/js/lib/*.js | head -8
echo
echo "=== 搜索"双语/翻译行"相关的逻辑 ==="
grep -rn 'LYR_TR\|trans\|双语\|translation\|BILING\|dual' themes/audio-archive/js/*.js themes/audio-archive/js/lib/*.js 2>/dev/null | head -16
echo
echo "=== 你原来那份双语 lrc 可能在哪（D:\\musiclab 与常见音乐目录）==="
for d in /d/musiclab /d/Music /d/音乐 /c/Users/lenovo/Music /c/Users/lenovo/Desktop /c/Users/lenovo/Downloads; do
  [ -d "$d" ] && find "$d" -maxdepth 3 -iname '*.lrc' 2>/dev/null | head -12
done
echo
echo "=== 整个 D 盘里含中文的 lrc（限时 20 秒，取前 15 个）==="
timeout 20 find /d -maxdepth 4 -iname '*.lrc' 2>/dev/null | head -40 | while read -r f; do
  if grep -qP '[\x{4e00}-\x{9fff}]' "$f" 2>/dev/null || iconv -f UTF-8 -t UTF-8 "$f" >/dev/null 2>&1 && grep -q '[一-龥]' "$f" 2>/dev/null; then echo "  含中文: $f"; fi
done | head -15
