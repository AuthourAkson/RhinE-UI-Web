// 纯直连、多轮取样：对关键 URL 各测 N 次，输出成功次数与中位耗时
const URLS = [
  ['应用首页', 'https://rhine.auak.dpdns.org/'],
  ['清单 307KB', 'https://rhine.auak.dpdns.org/__manifest.json'],
  ['app.js 31KB', 'https://rhine.auak.dpdns.org/app.js'],
  ['音频 100KB片段', 'https://rhine.auak.dpdns.org/musiclab/bombinsound.mp3'],
];
const N = Number(process.argv[3] || 5);
const label = process.argv[2] || 'measure';
const times = {};
for (const [name] of URLS) times[name] = [];
for (let i = 0; i < N; i++) {
  for (const [name, url] of URLS) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { cache: 'no-store', headers: { Range: name.includes('音频') ? 'bytes=0-102399' : undefined }, signal: AbortSignal.timeout(12000) });
      await r.arrayBuffer();
      times[name].push(r.ok || r.status === 206 ? Date.now() - t0 : -1);
    } catch (e) { times[name].push(-1); }
  }
}
console.log(`--- ${label}（每个 ${N} 次，直连）---`);
for (const [name] of URLS) {
  const ok = times[name].filter((t) => t > 0);
  const med = ok.length ? ok.sort((a, b) => a - b)[Math.floor(ok.length / 2)] : -1;
  console.log(`   ${name.padEnd(16)} 成功 ${ok.length}/${N}   中位 ${med}ms   ${ok.map((t) => t + 'ms').join(' ')}`);
}
