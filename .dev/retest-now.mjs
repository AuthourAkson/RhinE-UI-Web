// 复测（用户要求）：同一时刻多轮取样，分清"是我们域名慢"还是"整条 CF 路径慢"
//   ① /cdn-cgi/trace 看落到哪个边缘机房（colo）
//   ② 我们域名的关键资源（直连 / 走代理）
//   ③ 与本站无关的两个 Cloudflare 站点
//   ④ 到各 IP 的 TCP 握手耗时（丢包/绕路的直接体现）
const trace = async (host) => {
  try {
    const r = await fetch(`https://${host}/cdn-cgi/trace?ts=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const kv = Object.fromEntries((await r.text()).trim().split('\n').map((l) => l.split('=')).filter((p) => p.length === 2));
    return kv;
  } catch (e) { return { err: e.name }; }
};
const get = async (url, note) => {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    const b = await r.arrayBuffer();
    const ms = Date.now() - t0;
    return { ok: true, status: r.status, ms, kb: b.byteLength / 1024, kbs: (b.byteLength / 1024) / (ms / 1000), note };
  } catch (e) { return { ok: false, err: e.name, ms: Date.now() - t0, note }; }
};
const line = (r) => r.ok ? `✓ ${String(r.status)} ${String(r.ms).padStart(6)}ms ${r.kb.toFixed(0).padStart(5)}KB ${r.kbs.toFixed(0).padStart(5)} KB/s  ${r.note}` : `✗ ${r.err} ${String(r.ms).padStart(6)}ms  ${r.note}`;

console.log('=== ① 我们域名落到哪个机房 ===');
const t = await trace('auak.dpdns.org');
console.log(`  ip=${t.ip} loc=${t.loc} colo=${t.colo} http=${t.http} tls=${t.tls}`);
const t2 = await trace('rhine.auak.dpdns.org');
console.log(`  rhine: ip=${t2.ip} colo=${t2.colo}`);

console.log('\n=== ② 我们域名的资源（直连，两轮）===');
const OURS = [
  ['app.js 80KB', 'https://rhine.auak.dpdns.org/app.js'],
  ['清单 307KB', 'https://rhine.auak.dpdns.org/__manifest.json'],
  ['影片帧 111KB', 'https://rhine.auak.dpdns.org/themes/audio-archive/assets/intro/white/frame-001.jpg'],
  ['首页', 'https://rhine.auak.dpdns.org/'],
];
for (let round = 1; round <= 2; round++) {
  console.log(`  --- 第 ${round} 轮 ---`);
  for (const [note, url] of OURS) console.log('   ' + line(await get(url, note)));
}

console.log('\n=== ③ 与本站无关的 Cloudflare 站点（同样直连）===');
for (const [note, url] of [
  ['cdnjs（CF 自家 CDN）', 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js'],
  ['cloudflare.com 官网', 'https://www.cloudflare.com/cdn-cgi/trace'],
]) console.log('   ' + line(await get(url, note)));

console.log('\n=== ④ 走代理对照（证明服务端本身很快）===');
for (const [note, url] of OURS.slice(0, 3)) console.log('   ' + line(await get(url, note + ' [代理]')));
