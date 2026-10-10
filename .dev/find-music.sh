#!/usr/bin/env bash
# 找现成音乐素材
echo "=== 常见音乐目录 ==="
for d in /d/Music /c/Users/lenovo/Music /d/音乐 /d/AgentTestLab /d/Downloads; do
  if [ -d "$d" ]; then
    n=$(find "$d" -maxdepth 3 \( -iname '*.mp3' -o -iname '*.flac' -o -iname '*.m4a' \) 2>/dev/null | wc -l)
    echo "  存在: $d  → $n 个音频文件"
  fi
done
echo ""
echo "=== D 盘浅层扫一遍音频（最多列 10 个） ==="
find /d -maxdepth 4 \( -iname '*.mp3' -o -iname '*.flac' -o -iname '*.m4a' -o -iname '*.wav' \) 2>/dev/null | head -10
echo ""
echo "=== 结论 ==="
n=$(find /d -maxdepth 4 \( -iname '*.mp3' -o -iname '*.flac' -o -iname '*.m4a' \) 2>/dev/null | wc -l)
if [ "$n" -eq 0 ]; then echo "  没找到现成音乐 → 用 ffmpeg 造测试素材"; else echo "  找到 $n 个，可作测试素材"; fi
