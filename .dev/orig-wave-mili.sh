#!/usr/bin/env bash
# 找到"原版录音室那条 Mili"对应的波形缓存（用同一路径/大小/时长算 key）并分析分布
set -u
CACHE='/d/AgentTestLab/RhinE-1.4.0-portable/foobar2000/profile/audio-archive-cache/waveform'
SONG='/d/AgentTestLab/RhinE-1.4.0-portable/musiclab/Mili - world.execute (me) ;.mp3'
node -e "
const fs = require('fs'), path = require('path');
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
const song = process.argv[1], cache = process.argv[2];
const st = fs.statSync(song);
// 原版路径（fb2k 里的完整路径）：D:\\AgentTestLab\\RhinE-1.4.0-portable\\musiclab\\Mili - world.execute (me) ;.mp3
const p = 'D:\\\\AgentTestLab\\\\RhinE-1.4.0-portable\\\\musiclab\\\\' + path.basename(song);
console.log('曲目:', p);
console.log('大小:', st.size, ' 时长(秒): 211.91 (从卡片读出 03:32)');
// 时长用 ffprobe 会更准，这里试几个候选
for (const len of ['211.91', '211.90', '212.00', '211.89', '211.906667']) {
  const key = fnv(p + '|0|' + st.size + '|' + Number(len).toFixed(2));
  const f = path.join(cache, key + '.json');
  if (fs.existsSync(f)) { console.log('✔ 命中缓存文件:', key + '.json', '(length=' + len + ')'); analyze(f); }
}
function analyze(f) {
  const arr = JSON.parse(fs.readFileSync(f, 'utf8')), n = arr.length;
  const s = arr.slice().sort((a, b) => a - b), q = pp => s[Math.floor(pp * (n - 1))];
  console.log('  点数=' + n, '均值=' + (arr.reduce((a, b) => a + b, 0) / n).toFixed(1));
  console.log('  分位 p10=' + q(.1), 'p25=' + q(.25), 'p50=' + q(.5), 'p75=' + q(.75), 'p90=' + q(.9), 'p99=' + q(.99));
  console.log('  >900 占比=' + (arr.filter(v => v > 900).length / n * 100).toFixed(1) + '%');
  console.log('  前 30:', arr.slice(0, 30).join(','));
  console.log('  中间 30:', arr.slice(500, 530).join(','));
}
" "$SONG" "$CACHE"
echo
echo "=== 顺便看所有缓存文件的分布（判断一致性）==="
for f in "$CACHE"/*.json; do
  node -e "
const arr = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')), n = arr.length;
const s = arr.slice().sort((a,b)=>a-b), q = p => s[Math.floor(p*(n-1))];
console.log(require('path').basename(process.argv[1]).padEnd(16), '均值=' + (arr.reduce((a,b)=>a+b,0)/n).toFixed(0).padStart(4), 'p50=' + String(q(.5)).padStart(4), 'p90=' + String(q(.9)).padStart(4), '>900=' + (arr.filter(v=>v>900).length/n*100).toFixed(1) + '%', '最大=' + s[n-1]);
" "$f"
done
