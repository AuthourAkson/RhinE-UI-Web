// 直连（不走代理）取真实公网 IP —— 这才是"我们自己"的地址
const hosts = ['auak.dpdns.org', 'rhine.auak.dpdns.org'];
const found = [];
for (const host of hosts) {
  try {
    const r = await fetch(`https://${host}/cdn-cgi/trace?ts=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
    const t = await r.text();
    const kv = Object.fromEntries(t.trim().split('\n').map((l) => l.split('=')).filter((p) => p.length === 2));
    console.log(`${host}:  ip=${kv.ip}  loc=${kv.loc}  colo=${kv.colo}  ${kv.ip?.includes(':') ? '(IPv6)' : '(IPv4)'}`);
    found.push({ host, ip: kv.ip, loc: kv.loc });
  } catch (e) { console.log(`${host}: 失败 ${e.message}`); }
}
console.log('\n直连看到的我们:', found.map((f) => f.ip).join('  '));
// 再取一次，看 IPv6 是否在轮换（家庭宽带的 IPv6 前缀通常稳定、后缀会变）
await new Promise((r) => setTimeout(r, 1500));
for (const host of hosts.slice(0, 1)) {
  try {
    const r = await fetch(`https://${host}/cdn-cgi/trace?ts=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
    const kv = Object.fromEntries((await r.text()).trim().split('\n').map((l) => l.split('=')).filter((p) => p.length === 2));
    console.log(`第二次 ${host}: ip=${kv.ip}  → ${kv.ip === found[0]?.ip ? '与上次相同' : '与上次不同（有轮换）'}`);
  } catch (e) { console.log('第二次失败', e.message); }
}
