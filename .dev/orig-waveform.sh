#!/usr/bin/env bash
# 看原版自己生成的波形缓存：它的取值分布能直接告诉我 utils.GetWaveformAsync 返回的是什么量
CACHE='/d/AgentTestLab/RhinE-1.4.0-portable/foobar2000/profile/audio-archive-cache'
echo "=== 原版缓存目录 ==="
ls -la "$CACHE" 2>/dev/null || echo "(没有这个目录)"
echo
echo "=== 波形缓存文件 ==="
ls -la "$CACHE/waveform" 2>/dev/null | head -10 || echo "(没有 waveform 子目录)"
echo
FIRST=$(ls "$CACHE/waveform"/*.json 2>/dev/null | head -1)
if [ -n "$FIRST" ]; then
  echo "=== 分析第一个波形缓存: $(basename "$FIRST") ==="
  node -e "
const arr = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
const n = arr.length;
const sorted = arr.slice().sort((a,b)=>a-b);
const q = p => sorted[Math.floor(p*(n-1))];
const mean = arr.reduce((a,b)=>a+b,0)/n;
console.log('  点数 =', n);
console.log('  最小/最大 =', sorted[0], '/', sorted[n-1]);
console.log('  均值 =', mean.toFixed(1));
console.log('  分位: p10=' + q(.1), 'p25=' + q(.25), 'p50=' + q(.5), 'p75=' + q(.75), 'p90=' + q(.9), 'p99=' + q(.99));
const near = arr.filter(v => v > 900).length;
console.log('  接近满值(>900)的比例 =', (near/n*100).toFixed(1) + '%');
console.log('  前 40 个值:', arr.slice(0, 40).join(','));
" "$FIRST"
else
  echo "(没有波形缓存文件 → 原版可能没在这台机器上放过这首，或缓存被清了)"
  echo "=== 看看缓存里都有什么 ==="
  find "$CACHE" -type f 2>/dev/null | head -20
fi
