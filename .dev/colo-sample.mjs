// 连续采样：看同一个域名在几分钟内落到哪些 Cloudflare 机房（colo 变了 = 路由/调度在动态变化）
const HOSTS = ['auak.dpdns.org', 'rhine.auak.dpdns.org'];
const N = 6;
const rows = [];
for (let i = 1; i <= N; i++) {
  const row = { i };
  for (const h of HOSTS) {
    const t0 = Date.now();
    try {
      const r = await fetch(`https://${h}/cdn-cgi/trace?ts=${Date.now()}_${i}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const kv = Object.fromEntries((await r.text()).trim().split('\n').map((l) => l.split('=')).filter((p) => p.length === 2));
      row[h] = `${kv.colo || '?'} (${Date.now() - t0}ms, ip=${kv.ip})`;
    } catch (e) { row[h] = `✗ ${e.name} (${Date.now() - t0}ms)`; }
  }
  rows.push(row);
  console.log(`第 ${i} 次  ${HOSTS.map((h) => h.split('.')[0] + '=' + row[h]).join('   ')}`);
  await new Promise((r) => setTimeout(r, 4000));
}
const colos = new Set();
for (const r of rows) for (const h of HOSTS) { const m = /^([A-Z]{3})/.exec(r[h] || ''); if (m) colos.add(m[1]); }
console.log(`\n这几分钟内出现过的机房: ${[...colos].join(', ') || '(一个都没连上)'}`);
console.log('常见机房代号: HKG=香港  NRT/KIX=日本  LAX/SJC/SEA=美西  DUB=都柏林  LHR=伦敦  FRA=法兰克福');
