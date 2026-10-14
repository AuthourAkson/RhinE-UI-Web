// ① 查出本机对外的公网 IP（用我们自己域名的 /cdn-cgi/trace，不依赖第三方）
// ② 测 Cloudflare token 的**写权限**：能不能改 WAF 规则 / 速率限制 / Bot 设置
import fs from 'node:fs';
const TOKEN = fs.readFileSync('D:/Skill实验室/.secrets/cf-token.txt', 'utf8').trim();
const API = 'https://api.cloudflare.com/client/v4';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

console.log('=== ① 本机公网出口 IP（走我们自己的域名看 Cloudflare 眼里的我们）===');
const ips = new Set();
for (const host of ['auak.dpdns.org', 'rhine.auak.dpdns.org']) {
  for (const scheme of ['https']) {
    try {
      const r = await fetch(`${scheme}://${host}/cdn-cgi/trace`, { headers: { 'cache-control': 'no-cache' } });
      const t = await r.text();
      const kv = Object.fromEntries(t.trim().split('\n').map((l) => l.split('=').map((s) => s.trim())).filter((p) => p.length === 2));
      console.log(`  ${host}: ip=${kv.ip}  loc=${kv.loc}  colo=${kv.colo}  http=${kv.http}  tls=${kv.tls?.slice(0, 24)}`);
      if (kv.ip) ips.add(kv.ip);
    } catch (e) { console.log(`  ${host}: 失败 ${e.message}`); }
  }
}
console.log('  本机公网 IP（去重）:', [...ips].join(', ') || '(没取到)');

console.log('\n=== ② token 的写权限探测（只读探测，不改任何东西）===');
const zone = (await (await fetch(`${API}/zones?name=auak.dpdns.org`, { headers: H })).json()).result[0].id;
const tries = [
  ['读 WAF 自定义规则', 'GET', `/zones/${zone}/rulesets/phases/http_request_firewall_custom/entrypoint`],
  ['读速率限制', 'GET', `/zones/${zone}/rulesets/phases/http_ratelimit/entrypoint`],
  ['读托管规则(WAF)', 'GET', `/zones/${zone}/rulesets/phases/http_request_firewall_managed/entrypoint`],
  ['读 Bot 管理', 'GET', `/zones/${zone}/bot_management`],
  ['读 IP 访问规则', 'GET', `/zones/${zone}/firewall/access_rules/rules?per_page=1`],
  ['读账户级 ruleset 列表', 'GET', `/zones/${zone}/rulesets`],
];
for (const [label, method, path] of tries) {
  const r = await fetch(API + path, { method, headers: H });
  const j = await r.json().catch(() => ({}));
  const ok = j.success === true;
  console.log(`  ${ok ? '✓ 可读' : '✗ 无权'}  ${label.padEnd(20)} ${ok ? '' : (j.errors?.[0]?.message || r.status)}`);
}
