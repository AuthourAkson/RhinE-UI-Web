#!/usr/bin/env bash
# 恢复演示曲库（把挪走的测试专辑放回去，保留 Miracle Milk）
set -eu
LIB=/d/AgentTestLab/RhinE-UI/.dev/music
FIX=/d/AgentTestLab/RhinE-UI/.dev/_fixtures
for d in "Test Album One" "Test Album Two" "No Tags Here"; do
  [ -d "$FIX/$d" ] && mv "$FIX/$d" "$LIB/" && echo "  放回 $d"
done
rmdir "$FIX" 2>/dev/null || true
echo ""
echo "=== 当前演示曲库 ==="
find "$LIB" -type f \( -iname '*.mp3' -o -iname '*.flac' \) | sort | while read -r f; do
  printf '  %s\n' "${f#$LIB/}"
done
echo ""
curl -s http://127.0.0.1:8300/__rebuild >/dev/null && echo "清单已重建"
