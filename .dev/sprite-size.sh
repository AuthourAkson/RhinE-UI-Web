#!/usr/bin/env bash
# 对比：磁盘上 PNG 的真实尺寸 vs 清单里记录的尺寸 vs case.json 声明的尺寸
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== rail 目录内容 ==="
ls -1 themes/audio-archive/assets/render/rail/
echo
echo "=== white 皮肤目录内容（前 12）==="
ls -1 themes/audio-archive/assets/render/case/white/ | head -12
echo
node -e "
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/AgentTestLab/RhinE-UI';
function pngSize(f) {
  const b = fs.readFileSync(f).subarray(0, 24);
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20);
}
const files = [
  'themes/audio-archive/assets/render/case/white/array-clear.png',
  'themes/audio-archive/assets/render/case/white/array-frost.png',
  'themes/audio-archive/assets/render/case/white/hero-clear.png',
  'themes/audio-archive/assets/render/case/white/inspect-00.png',
  'themes/audio-archive/assets/render/rail/mid.png',
  'themes/audio-archive/assets/render/rail/front.png',
  'themes/audio-archive/assets/render/rail/back.png',
];
console.log('=== 磁盘实际尺寸 ===');
for (const f of files) {
  const full = path.join(ROOT, f);
  console.log('  ', fs.existsSync(full) ? pngSize(full) : '(不存在)', ' ', f.replace('themes/audio-archive/assets/render/', ''));
}
console.log();
console.log('=== rail 目录全部文件+尺寸 ===');
for (const n of fs.readdirSync(path.join(ROOT, 'themes/audio-archive/assets/render/rail'))) {
  const full = path.join(ROOT, 'themes/audio-archive/assets/render/rail', n);
  if (n.endsWith('.png')) console.log('  ', pngSize(full), ' ', n);
}
"
