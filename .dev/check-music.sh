#!/usr/bin/env bash
# 检查可用作测试素材的音频及其标签
LAB='/d/AgentTestLab/RhinE-1.4.0-portable/musiclab'
echo "=== musiclab 目录 ==="
if [ -d "$LAB" ]; then
  find "$LAB" -type f | head -30
  echo "  文件数: $(find "$LAB" -type f | wc -l)"
  du -sh "$LAB"
else
  echo "  不存在"
fi
echo ""
echo "=== musiclab 里音频的标签（用 ffprobe 看） ==="
find "$LAB" -type f \( -iname '*.mp3' -o -iname '*.flac' -o -iname '*.m4a' -o -iname '*.ogg' -o -iname '*.wav' \) 2>/dev/null | head -5 | while read -r f; do
  echo "--- $(basename "$f") ---"
  ffprobe -v quiet -print_format json -show_format -show_streams "$f" 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  try{const j=JSON.parse(s);const t=j.format.tags||{};const a=j.streams.find(x=>x.codec_type==="audio")||{};
  const pick=(o,...ks)=>{for(const k of Object.keys(o))for(const want of ks)if(k.toLowerCase()===want)return o[k];return ""};
  console.log("    格式",j.format.format_name,"| 时长",(+j.format.duration).toFixed(1)+"s","|",a.codec_name||"",a.sample_rate?Math.round(a.sample_rate/1000)+"kHz":"");
  console.log("    标题:",pick(t,"title")||"(无)","| 艺术家:",pick(t,"artist")||"(无)");
  console.log("    专辑:",pick(t,"album")||"(无)","| 音轨:",pick(t,"track")||"(无)","| 流派:",pick(t,"genre")||"(无)");
  console.log("    内嵌封面:",j.streams.some(x=>x.codec_type==="video")?"有":"无");
  }catch(e){console.log("    解析失败",e.message)}
})'
done
