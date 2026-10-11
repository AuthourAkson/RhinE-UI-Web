#!/usr/bin/env bash
# 查清"疑似 .git / chrome-profile"到底是哪些文件
set -u
node -e "
const http = require('http');
http.get('http://127.0.0.1:8300/__manifest.json', (res) => {
  let b = ''; res.on('data', (c) => b += c);
  res.on('end', () => {
    const m = JSON.parse(b);
    const hits = m.files.filter((f) => f.startsWith('.git') || f.includes('chrome-profile'));
    console.log('匹配到的文件（应该只有 .gitignore 这类）：');
    for (const f of hits.slice(0, 20)) console.log('  ', f);
    console.log('总数:', hits.length);
    console.log();
    console.log('真正在 .git/ 目录里的:', m.files.filter((f) => f.startsWith('.git/')).length);
    console.log('在 .dev/chrome-profile 里的:', m.files.filter((f) => f.startsWith('.dev/chrome-profile')).length);
  });
}).on('error', (e) => { console.error(e.message); process.exit(1); });
"
