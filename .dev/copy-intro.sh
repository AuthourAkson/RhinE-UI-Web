#!/usr/bin/env bash
# 把开场动画素材（10 套皮肤 × 145 帧）拷进移植版
set -eu
SRC='/d/AgentTestLab/RhinE-1.4.0-portable/audio-archive-1.4.0/assets/intro'
DST='/d/AgentTestLab/RhinE-UI/themes/audio-archive/assets/intro'
mkdir -p "$DST"
cp -r "$SRC"/. "$DST"/
echo "=== 拷贝完成 ==="
du -sh "$DST"
echo "=== 各皮肤帧数 ==="
for d in "$DST"/*/; do
  n=$(ls "$d" | grep -c '\.jpg$' || true)
  printf '  %-8s %s 帧  %s\n' "$(basename "$d")" "$n" "$(du -sh "$d" | cut -f1)"
done
echo "=== white/intro.json（决定 fps / 帧数 / 跟随点） ==="
head -c 700 "$DST/white/intro.json"
echo ""
echo "=== 首尾帧文件 ==="
ls "$DST/white" | grep '\.jpg$' | head -2
ls "$DST/white" | grep '\.jpg$' | tail -1
