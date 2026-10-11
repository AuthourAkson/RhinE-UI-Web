#!/usr/bin/env bash
# 直接检查 manifest 的键是否正确（不用浏览器）
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
node -e "
const http = require('http');
http.get('http://127.0.0.1:8300/__manifest.json', (res) => {
  let b = '';
  res.on('data', (c) => b += c);
  res.on('end', () => {
    const m = JSON.parse(b);
    const keys = Object.keys(m.text);
    const imgs = Object.keys(m.images);
    const show = (label, arr) => console.log(label.padEnd(26), arr.length);
    show('文本文件', keys);
    show('图片尺寸', imgs);
    show('全部文件', m.files);
    console.log();
    console.log('关键文本键是否存在:');
    for (const k of ['themes/audio-archive/js/frame.js', 'themes/audio-archive/js/archive.js',
                     'themes/audio-archive/tokens/tokens.json', 'shim/shim.js', 'app.js',
                     'themes/audio-archive/assets/render/case/white/case.json',
                     'themes/audio-archive/assets/render/rail/rail.json']) {
      console.log('  ', keys.includes(k) ? '✓' : '✗', k);
    }
    console.log();
    console.log('关键图片键是否存在:');
    for (const k of imgs.filter((x) => /case\/white\/|rail\/|floor\//.test(x)).slice(0, 5)) console.log('   ✓', k);
    console.log();
    console.log('是否还扫进 .git / chrome-profile:', m.files.some((f) => f.startsWith('.git') || f.includes('chrome-profile')) ? '✗ 有' : '✓ 没有');
    console.log('脚本顺序解析:', Object.entries(m.scripts).map(([k, v]) => k + '(' + v.length + ')').join(' '));
  });
}).on('error', (e) => { console.error('取 manifest 失败:', e.message); process.exit(1); });
"
