// 实验：证明卡顿是否由我加的两条 WAF 规则造成
//   步骤：① 规则开 → 测  ② 只关掉"我加的/我改的"两条 → 测  ③ 恢复
// 同时打印 zone 级安全设置（GPT 说的"安全策略"通常指这些：安全级别 / Bot Fight / 挑战模式）
import fs from 'node:fs';
const TOKEN = fs.readFileSync('D:/Skill实验室/.secrets/cf-token.txt', 'utf8').trim();
const API = 'https://api.cloudflare.com/client/v4';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const req = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { ok: r.ok, j: await r.json().catch(() => ({})) }; };
const zone = (await req('GET', '/zones?name=auak.dpdns.org')).j.result[0].id;
const MINE = ['rhine: block /musiclab hotlinking from other sites', 'AI Crawl Control - Block AI bots by User Agent'];

// ---------- 测量（直连） ----------
const URLS = [
  ['应用首页', 'https://rhine.auak.dpdns.org/'],
  ['清单 307KB', 'https://rhine.auak.dpdns.org/__manifest.json'],
  ['app.js 31KB', 'https://rhine.auak.dpdns.org/app.js'],
  ['CF 自家 CDN（无关站点）', 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js'],
];
const measure = async (label) => {
  console.log(`--- ${label} ---`);
  for (const [name, url] of URLS) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      const b = await r.arrayBuffer();
      console.log(`   ✓ ${name.padEnd(22)} ${r.status} ${String(Date.now() - t0).padStart(6)}ms ${(b.byteLength / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.log(`   ✗ ${name.padEnd(22)} ${e.name} ${Date.now() - t0}ms`);
    }
  }
};

// ---------- zone 级安全设置（GPT 所指的"安全策略"）----------
console.log('=== zone 级安全设置（这些才是会"挑战/拦截正常访客"的开关）===');
const st = await req('GET', `/zones/${zone}/settings`);
for (const s of (st.j.result || []).filter((x) => ['security_level', 'browser_check', 'challenge_ttl', 'privacy_pass', 'ssl', 'always_use_https', 'min_tls_version', 'development_mode'].includes(x.id)))
  console.log(`  ${s.id.padEnd(20)} ${JSON.stringify(s.value)}`);

// ---------- 取当前规则 ----------
const ep = await req('GET', `/zones/${zone}/rulesets/phases/http_request_firewall_custom/entrypoint`);
const rsId = ep.j.result.id;
const before = ep.j.result.rules || [];
console.log(`\n=== 我加/改的规则状态 ===`);
for (const r of before.filter((x) => MINE.includes(x.description))) console.log(`  ${r.description}  enabled=${r.enabled !== false}`);

// ① 规则开（现状）测一次
console.log('\n########## ① 规则开启（现状）##########');
await measure('规则 ON');

// ② 关掉我的两条
const off = before.map((r) => (MINE.includes(r.description) ? { ...r, enabled: false } : r));
const r2 = await req('PUT', `/zones/${zone}/rulesets/${rsId}`, { rules: off });
console.log(`\n（已临时关闭我的两条规则: ${r2.ok ? '成功' : '失败 ' + JSON.stringify(r2.j.errors)?.slice(0, 120)}）`);
await new Promise((r) => setTimeout(r, 8000));       // 等规则下发
console.log('\n########## ② 我的两条规则关闭 ##########');
await measure('规则 OFF');

// ③ 恢复
const r3 = await req('PUT', `/zones/${zone}/rulesets/${rsId}`, { rules: before });
console.log(`\n（已恢复: ${r3.ok ? '成功 ✓' : '失败 ✗ ' + JSON.stringify(r3.j.errors)?.slice(0, 120)}）`);
const after = await req('GET', `/zones/${zone}/rulesets/phases/http_request_firewall_custom/entrypoint`);
console.log('恢复后规则数:', (after.j.result.rules || []).length, '  我的两条 enabled:',
  (after.j.result.rules || []).filter((x) => MINE.includes(x.description)).map((x) => x.enabled !== false).join(','));
