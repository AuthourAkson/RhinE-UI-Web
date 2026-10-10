import fs from 'node:fs';
const m = JSON.parse(fs.readFileSync('.dev/manifest.json', 'utf8'));
const src = m.text['themes/audio-archive/js/frame.js'];
console.log('frame.js 长度:', src ? src.length : 'MISSING');
console.log('前 400 字符:', JSON.stringify(src.slice(0, 400)));

const re1 = /include\(\s*fb\.ProfilePath\s*\+\s*"([^"]+)"\s*\)/g;
console.log('正则①匹配数:', [...src.matchAll(re1)].length, [...src.matchAll(re1)].map(x => x[1]));

// 宽松版：先看 include( 出现在哪
for (const mm of src.matchAll(/include\([^)]*\)/g)) console.log('  宽松匹配:', JSON.stringify(mm[0]));
