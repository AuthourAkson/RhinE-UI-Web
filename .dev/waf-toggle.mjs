// 只做一件事：把我加/改的两条 WAF 规则置为开或关（API 走代理时运行）
//   node .dev/waf-toggle.mjs off|on
import fs from 'node:fs';
const TOKEN = fs.readFileSync('D:/Skill实验室/.secrets/cf-token.txt', 'utf8').trim();
const API = 'https://api.cloudflare.com/client/v4';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const want = process.argv[2] === 'off' ? false : true;
const MINE = ['rhine: block /musiclab hotlinking from other sites', 'AI Crawl Control - Block AI bots by User Agent'];

const get = async (p) => (await (await fetch(API + p, { headers: H })).json());
const put = async (p, b) => (await (await fetch(API + p, { method: 'PUT', headers: H, body: JSON.stringify(b) })).json());
const zone = (await get('/zones?name=auak.dpdns.org')).result[0].id;
const ep = await get(`/zones/${zone}/rulesets/phases/http_request_firewall_custom/entrypoint`);
const rules = (ep.result.rules || []).map((r) => (MINE.includes(r.description) ? { ...r, enabled: want } : r));
const res = await put(`/zones/${zone}/rulesets/${ep.result.id}`, { rules });
console.log(`规则置为 ${want ? '开启' : '关闭'}: ${res.success ? '✓' : '✗ ' + JSON.stringify(res.errors)?.slice(0, 150)}`);
const chk = await get(`/zones/${zone}/rulesets/phases/http_request_firewall_custom/entrypoint`);
for (const r of (chk.result.rules || [])) console.log(`  enabled=${String(r.enabled !== false).padEnd(5)} ${r.description}`);
