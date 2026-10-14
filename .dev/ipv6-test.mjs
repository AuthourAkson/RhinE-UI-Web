// 验证 IPv6 假设：同一批 URL，默认解析顺序（优先 IPv6）vs 强制 IPv4
// 若"默认慢/超时、IPv4 快" → 国内 IPv6 到 Cloudflare 不通，就是卡顿根源
import dns from 'node:dns';
const URLS = [
  ['应用首页', 'https://rhine.auak.dpdns.org/'],
  ['app.js', 'https://rhine.auak.dpdns.org/app.js'],
  ['清单', 'https://rhine.auak.dpdns.org/__manifest.json'],
  ['主题JS', 'https://rhine.auak.dpdns.org/themes/audio-archive/js/frame.js'],
  ['音频', 'https://rhine.auak.dpdns.org/musiclab/bombinsound.mp3'],
  ['门户首页', 'https://auak.dpdns.org/'],
];
const run = async (label) => {
  console.log(`\n=== ${label} ===`);
  for (const [name, url] of URLS) {
    const t0 = performance.now();
    let out;
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const b = await r.arrayBuffer();
      out = `${r.status} ${Math.round(performance.now() - t0)}ms ${(b.byteLength / 1024).toFixed(0)}KB`;
    } catch (e) { out = `✗ ${e.name} ${Math.round(performance.now() - t0)}ms`; }
    console.log(`  ${name.padEnd(10)} ${out}`);
  }
};
// ① 默认（node 会优先 IPv6）
dns.setDefaultResultOrder('verbatim');
await run('默认解析顺序（优先 IPv6）');
// ② 强制 IPv4 优先
dns.setDefaultResultOrder('ipv4first');
await run('强制 IPv4 优先');
// ③ 看两个域名的 A / AAAA
for (const host of ['rhine.auak.dpdns.org', 'auak.dpdns.org']) {
  const a = await dns.promises.resolve4(host).catch((e) => 'ERR ' + e.code);
  const aaaa = await dns.promises.resolve6(host).catch((e) => 'ERR ' + e.code);
  console.log(`\n${host}\n  A    : ${Array.isArray(a) ? a.join(', ') : a}\n  AAAA : ${Array.isArray(aaaa) ? aaaa.join(', ') : aaaa}`);
}
