#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI/themes/audio-archive/assets/render || exit 1
echo "=== case 目录 ==="
ls -1 case/ 2>/dev/null
echo
echo "=== case.json 的键与关键几何 ==="
node -e "
const j = require('/d/AgentTestLab/RhinE-UI/themes/audio-archive/assets/render/case/case.json');
const o = {};
for (const k of Object.keys(j)) o[k] = (typeof j[k] === 'object' && j[k] !== null) ? (Array.isArray(j[k]) ? '数组[' + j[k].length + ']' : '对象{' + Object.keys(j[k]).join(',') + '}') : j[k];
console.log(JSON.stringify(o, null, 1));
console.log('--- 关键几何 ---');
console.log('axes.x =', JSON.stringify(j.axes && j.axes.x));
console.log('axes.y =', JSON.stringify(j.axes && j.axes.y));
console.log('axes.z =', JSON.stringify(j.axes && j.axes.z));
console.log('array_res =', JSON.stringify(j.array_res));
console.log('array.origin =', JSON.stringify(j.array && j.array.origin));
console.log('array.center =', JSON.stringify(j.array && j.array.center));
console.log('array.cover =', JSON.stringify(j.array && j.array.cover));
console.log('array.label =', JSON.stringify(j.array && j.array.label));
console.log('array 其它键 =', Object.keys(j.array || {}).join(','));
"
echo
echo "=== rail.json ==="
node -e "
const j = require('/d/AgentTestLab/RhinE-UI/themes/audio-archive/assets/render/rail/rail.json');
console.log(JSON.stringify(Object.fromEntries(Object.entries(j).map(([k,v]) => [k, Array.isArray(v) ? '数组'+JSON.stringify(v) : (typeof v === 'object' && v ? Object.keys(v) : v)])), null, 1));
"
echo
echo "=== 案例皮肤目录 ==="
ls -1 . | head -20
