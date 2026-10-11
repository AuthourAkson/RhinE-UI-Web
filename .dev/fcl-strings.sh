#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
node -e "
const fs = require('fs');
const files = [
  'themes/audio-archive/columns/preset-album-archive-dark.fcl',
  'themes/audio-archive/columns/preset-index-archive-dark.fcl',
];
for (const f of files) {
  const b = fs.readFileSync(f);
  // latin1 → 抽可打印串（长度≥4）
  const s = b.toString('latin1');
  const runs = s.match(/[\x20-\x7e\u00a0-\uffff]{4,}/g) || [];
  console.log('=== ' + f + ' (' + b.length + ' 字节) ===');
  const seen = new Set();
  for (const r of runs) {
    const t = r.trim();
    if (t.length < 4 || seen.has(t)) continue;
    seen.add(t);
    console.log('   ' + JSON.stringify(t).slice(0, 160));
  }
  console.log();
}
" 2>&1 | head -60
