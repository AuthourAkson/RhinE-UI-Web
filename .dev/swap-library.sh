#!/usr/bin/env bash
# 用与原版参考图完全相同的素材（主题包自带的 Mili 单曲）做对比
set -eu
LIB=/d/AgentTestLab/RhinE-UI/.dev/music
FIX=/d/AgentTestLab/RhinE-UI/.dev/_fixtures
SRC='/d/AgentTestLab/RhinE-1.4.0-portable/musiclab/Mili - world.execute (me) ;.mp3'

echo "=== 把测试专辑挪开，换成单曲 ==="
mkdir -p "$FIX"
for d in "Test Album One" "Test Album Two" "No Tags Here"; do
  [ -d "$LIB/$d" ] && mv "$LIB/$d" "$FIX/" && echo "  挪走 $d"
done
mkdir -p "$LIB/Miracle Milk"
cp "$SRC" "$LIB/Miracle Milk/world.execute (me) ;.mp3"
echo "  放入: Miracle Milk/world.execute (me) ;.mp3"

echo ""
echo "=== 看看这首歌的标签（应与原版卡片一致）==="
ffprobe -v quiet -print_format json -show_format "$SRC" 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  try { const j=JSON.parse(s); const t=j.format.tags||{};
    for (const k of Object.keys(t)) if (/title|artist|album|track|date|genre/i.test(k)) console.log("   ", k, "=", t[k]);
    console.log("    时长 =", (+j.format.duration).toFixed(2), "秒");
  } catch(e) { console.log("    解析失败", e.message); }
})'

echo ""
echo "=== 重建清单 ==="
curl -s http://127.0.0.1:8300/__rebuild >/dev/null; echo "  ok"
