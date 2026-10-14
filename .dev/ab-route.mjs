// 干净 A/B：同一批 URL，「走代理」vs「裸直连」，只为确认卡顿到底出在哪一段链路
const URLS = [
  ['应用首页', 'https://rhine.auak.dpdns.org/'],
  ['app.js (31KB)', 'https://rhine.auak.dpdns.org/app.js'],
  ['清单 (307KB)', 'https://rhine.auak.dpdns.org/__manifest.json'],
  ['主题 frame.js (14KB)', 'https://rhine.auak.dpdns.org/themes/audio-archive/js/frame.js'],
  ['门户首页', 'https://auak.dpdns.org/'],
];
const run = async (label) => {
  console.log(`\n=== ${label} ===`);
  let ok = 0;
  for (const [name, url] of URLS) {
    const t0 = performance.now();
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      const b = await r.arrayBuffer();
      const ms = Math.round(performance.now() - t0);
      const kbs = (b.byteLength / 1024) / (ms / 1000);
      console.log(`  ✓ ${name.padEnd(20)} ${String(r.status)} ${String(ms).padStart(6)}ms ${String((b.byteLength / 1024).toFixed(0)).padStart(5)}KB  ${kbs.toFixed(1)} KB/s`);
      ok++;
    } catch (e) {
      console.log(`  ✗ ${name.padEnd(20)} ${e.name} ${Math.round(performance.now() - t0)}ms`);
    }
  }
  return ok;
};
const a = await run('① 裸直连（不走代理）—— 国内普通用户走的路');
const b = await run('② 走本地代理 127.0.0.1:7897');
console.log(`\n结论：直连成功 ${a}/${URLS.length}，走代理成功 ${b}/${URLS.length}`);
