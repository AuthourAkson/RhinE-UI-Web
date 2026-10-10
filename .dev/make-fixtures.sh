#!/usr/bin/env bash
# 生成测试音乐库：2 张带封面/标签的专辑（MP3 + FLAC）+ 1 首无标签的裸文件
set -eu
OUT='/d/AgentTestLab/RhinE-UI/.dev/music'
TMP='/d/AgentTestLab/RhinE-UI/.dev/_tmp'
rm -rf "$OUT" "$TMP"; mkdir -p "$OUT/Test Album One" "$OUT/Test Album Two" "$OUT/No Tags Here" "$TMP"

mkcover() { # $1=输出 $2=底色 $3=文字
  ffmpeg -y -hide_banner -loglevel error -f lavfi -i "color=c=$2:s=600x600" \
    -vf "drawtext=text='$3':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=24" \
    -frames:v 1 "$1"
}
mktone() { # $1=输出 $2=频率 $3=秒数
  ffmpeg -y -hide_banner -loglevel error -f lavfi -i "sine=frequency=$2:duration=$3" -af volume=0.35 "$1"
}
attach() { # $1=音频 $2=封面 $3=输出 $4...=附加参数
  local a="$1" c="$2" o="$3"; shift 3
  ffmpeg -y -hide_banner -loglevel error -i "$a" -i "$c" -map 0:a -map 1:v -c copy -disposition:v attached_pic "$@" "$o"
}

echo "=== 1) 封面 ==="
mkcover "$TMP/cover-a.jpg" '0x1f6feb' 'ALBUM ONE'
mkcover "$TMP/cover-b.jpg" '0x2ea043' 'ALBUM TWO'
ls -l "$TMP"/*.jpg | awk '{printf "  %s  %d bytes\n", $NF, $5}'

echo ""
echo "=== 2) 专辑一：MP3 / ID3v2.3 + APIC ==="
i=1
while IFS='|' read -r freq dur title; do
  mkdir -p "$TMP/mp3"
  mktone "$TMP/mp3/t.mp3" "$freq" "$dur"
  ffmpeg -y -hide_banner -loglevel error -i "$TMP/mp3/t.mp3" -c:a copy \
    -id3v2_version 3 -write_id3v1 1 \
    -metadata title="$title" -metadata artist="Test Artist" -metadata album="Test Album One" \
    -metadata album_artist="Test Artist" -metadata track="$i/3" -metadata date="2024" -metadata genre="Electronic" \
    -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" \
    "$TMP/mp3/tagged.mp3"
  attach "$TMP/mp3/tagged.mp3" "$TMP/cover-a.jpg" "$OUT/Test Album One/0$i - $title.mp3" -id3v2_version 3
  i=$((i+1))
done <<'EOF'
220|6|First Track
330|7|Second Track
440|5|Third Track
EOF

echo ""
echo "=== 3) 专辑二：FLAC / Vorbis 注释 + PICTURE ==="
i=1
while IFS='|' read -r freq dur title; do
  mkdir -p "$TMP/flac"
  mktone "$TMP/flac/t.wav" "$freq" "$dur"
  ffmpeg -y -hide_banner -loglevel error -i "$TMP/flac/t.wav" -c:a flac \
    -metadata title="$title" -metadata artist="Another Artist" -metadata album="Test Album Two" \
    -metadata album_artist="Another Artist" -metadata track="$i/2" -metadata date="2023" -metadata genre="Ambient" \
    "$TMP/flac/tagged.flac"
  attach "$TMP/flac/tagged.flac" "$TMP/cover-b.jpg" "$OUT/Test Album Two/$i - $title.flac"
  i=$((i+1))
done <<'EOF'
550|8|Alpha
660|6|Beta
EOF

echo ""
echo "=== 4) 无标签裸文件 ==="
mktone "$TMP/bare.mp3" 880 4
ffmpeg -y -hide_banner -loglevel error -i "$TMP/bare.mp3" -c:a copy -map_metadata -1 "$OUT/No Tags Here/unnamed.mp3"

echo ""
echo "=== 结果 ==="
find "$OUT" -type f | sort | while read -r f; do
  printf '  %-46s %8s\n' "${f#$OUT/}" "$(du -h "$f" | cut -f1)"
done
echo "  总大小: $(du -sh "$OUT" | cut -f1)"
rm -rf "$TMP"
