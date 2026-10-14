// 直连测速（不带任何代理环境变量时运行）—— 用于 WAF 开关的 A/B 对照
const URLS = [
  ['应用首页', 'https://rhine.auak.dpdns.org/'],
  ['清单 307KB', 'https://rhine.auak.dpdns.org/__manifest.json'],
  ['app.js 31KB', 'https://rhine.auak.dpdns.org/app.js'],
  ['门户首页', 'https://auak.dpdns.org/'],
  ['CF 自家 CDN（与我无关的另一个 zone）', 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js'],
];
const label = process.argv[2] || '直连测速';
console.log(`--- ${label} ---`);
for (const [name, url] of URLS) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    const b = await r.arrayBuffer();
    console.log(`   ✓ ${name.padEnd(38)} ${r.status} ${String(Date.now() - t0).padStart(6)}ms ${(b.byteLength / 1024).toFixed(0)}KB`);
  } catch (e) {
    console.log(`   ✗ ${name.padEnd(38)} ${e.name} ${Date.now() - t0}ms`);
  }
}
