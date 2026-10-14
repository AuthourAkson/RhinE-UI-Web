// 多轮对照：关掉我加/改的两条规则 vs 保持开启，各测 5 轮，比成功率与中位耗时
// 需要两个进程分开跑（API 走代理、测速走直连），这里由外层 pwsh 交替调用
import fs from 'node:fs';
const TOKEN = fs.readFileSync('D:/Skill实验室/.secrets/cf-token.txt', 'utf8').trim();
const API = 'https://api.cloudflare.com/client/v4';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const MINE = ['rhine: block /musiclab hotlinking from other sites', 'AI Crawl Control - Block AI bots by User Agent'];
const get = async (p) => (await (await fetch(API + p, { headers: H })).json());
const put = async (p, b) => (await (await fetch(API + p, { method: 'PUT', headers: H, body: JSON.stringify(b) })).json());
const zone = (await get('/zones?name=auak.dpdns.org')).result[0].id;
const ep = await get(`/zones/${zone}/rulesets/phases/http_request_firewall_custom/entrypoint`);
const want = process.argv[2] === 'off' ? false : true;
const rules = (ep.result.rules || []).map((r) => (MINE.includes(r.description) ? { ...r, enabled: want } : r));
const res = await put(`/zones/${zone}/rulesets/${ep.result.id}`, { rules });
console.log(`[waf] 我的两条规则 → ${want ? '开启' : '关闭'}  ${res.success ? '✓' : '✗ ' + JSON.stringify(res.errors)?.slice(0, 120)}`);
