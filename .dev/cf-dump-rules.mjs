// 只读：把现有的 WAF 自定义规则 / 速率限制规则原样打印（不做任何修改）
import fs from 'node:fs';
const TOKEN = fs.readFileSync('D:/Skill实验室/.secrets/cf-token.txt', 'utf8').trim();
const API = 'https://api.cloudflare.com/client/v4';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const get = async (p) => (await (await fetch(API + p, { headers: H })).json());
const zone = (await get('/zones?name=auak.dpdns.org')).result[0].id;

for (const [label, phase] of [['WAF 自定义规则', 'http_request_firewall_custom'], ['速率限制规则', 'http_ratelimit'], ['WAF 托管规则', 'http_request_firewall_managed']]) {
  const e = await get(`/zones/${zone}/rulesets/phases/${phase}/entrypoint`);
  console.log(`\n=== ${label}（phase=${phase}）===`);
  if (!e.success) { console.log('  读取失败:', e.errors?.[0]?.message); continue; }
  const rules = e.result?.rules || [];
  console.log(`  ruleset: ${e.result?.name}  id=${e.result?.id}  规则数=${rules.length}`);
  for (const r of rules) {
    console.log(`  ---`);
    console.log(`   描述   : ${r.description || '(无)'}`);
    console.log(`   动作   : ${r.action}${r.action_parameters ? ' ' + JSON.stringify(r.action_parameters) : ''}`);
    console.log(`   启用   : ${r.enabled !== false}`);
    console.log(`   表达式 : ${r.expression}`);
    if (r.ratelimit) console.log(`   限流   : ${JSON.stringify(r.ratelimit)}`);
  }
}
