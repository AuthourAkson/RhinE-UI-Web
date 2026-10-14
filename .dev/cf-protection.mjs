// 查当前防护：WAF 托管规则 / 自定义规则 / 速率限制 / Bot Fight Mode / 安全级别
import fs from 'node:fs';
const TOKEN = fs.readFileSync('D:/Skill实验室/.secrets/cf-token.txt', 'utf8').trim();
const API = 'https://api.cloudflare.com/client/v4';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const get = async (p) => { const r = await fetch(API + p, { headers: H }); return r.json(); };
const zone = (await get('/zones?name=auak.dpdns.org')).result[0].id;

console.log('=== 入口阶段的 ruleset（WAF / 速率限制）===');
const rs = await get(`/zones/${zone}/rulesets`);
if (!rs.success) console.log('  读取失败:', JSON.stringify(rs.errors).slice(0, 200));
for (const r of (rs.result || [])) {
  console.log(`  phase=${String(r.phase).padEnd(34)} kind=${String(r.kind).padEnd(16)} 版本=${r.version}  名称=${r.name}  id=${r.id}`);
}

console.log('\n=== 各入口阶段里生效的规则 ===');
for (const phase of ['http_request_firewall_managed', 'http_request_firewall_custom', 'http_ratelimit', 'http_request_transform']) {
  const e = await get(`/zones/${zone}/rulesets/phases/${phase}/entrypoint`);
  if (!e.success) { console.log(`  ${phase}: 无（${(e.errors?.[0]?.message || '').slice(0, 60)}）`); continue; }
  const rules = e.result?.rules || [];
  console.log(`  ${phase}: ${rules.length} 条`);
  for (const r of rules) {
    const act = r.action || r.action_parameters?.action || '(继承)';
    console.log(`     - ${String(r.description || r.id).slice(0, 52)}  action=${act}  enabled=${r.enabled !== false}  expr=${String(r.expression || '').slice(0, 60)}`);
  }
}

console.log('\n=== 速率限制规则（旧接口）===');
const rl = await get(`/zones/${zone}/rate_limits`);
console.log('  ' + (rl.success ? `${(rl.result || []).length} 条` + ((rl.result || []).map((x) => ` [${x.disabled ? '停用' : '启用'} ${x.url_pattern}]`).join('')) : JSON.stringify(rl.errors).slice(0, 120)));

console.log('\n=== Bot Fight Mode（免费版叫 Bot Fight Mode）===');
for (const p of [`/zones/${zone}/settings/bot_fight_mode`, `/zones/${zone}/bot_management`]) {
  const b = await get(p);
  console.log(`  ${p} → ${JSON.stringify(b.result ?? b.errors).slice(0, 160)}`);
}

console.log('\n=== 其他安全设置 ===');
const st = await get(`/zones/${zone}/settings`);
const want = ['security_level', 'browser_check', 'challenge_ttl', 'privacy_pass', 'hotlink_protection', 'email_obfuscation', 'server_side_exclude', 'ssl', 'always_use_https', 'min_tls_version', 'opportunistic_onion', 'automatic_platform_optimization'];
for (const s of (st.result || []).filter((x) => want.includes(x.id))) console.log(`  ${s.id.padEnd(32)} ${JSON.stringify(s.value)}`);
