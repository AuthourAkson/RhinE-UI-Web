// B：给 /musiclab/* 加 ①防盗链(WAF 自定义规则) ②限流(速率限制规则)
//   node .dev/cf-apply-b.mjs            → 先 dry-run，打印将要做的事（不改动）
//   node .dev/cf-apply-b.mjs --apply    → 真正写入（会保留你已有的规则）
//   node .dev/cf-apply-b.mjs --rollback → 删掉本脚本加的两条规则
//
// 设计原则（来自用户要求"别给整炸了"）：
//   · 只作用于 /musiclab/*，首页/面板/静态资源一律不管
//   · 防盗链规则**允许空 Referer**（直接打开链接、应用同源请求都正常），只挡"其他网站引用"
//   · 限流 40 次/分钟/IP（正常听歌 1~4 次，够不到），并**显式豁免你家宽带那段 202.97.145.0/24**
//   · 不动其他规则：先读出来，只追加；--rollback 只删自己加的那两条
import fs from 'node:fs';
const TOKEN = fs.readFileSync('D:/Skill实验室/.secrets/cf-token.txt', 'utf8').trim();
const API = 'https://api.cloudflare.com/client/v4';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');

const HOME_NET = '202.97.145.0/24';      // 直连测得的你家公网 IPv4 所在网段（202.97.145.120）
const HOTLINK_DESC = 'rhine: block /musiclab hotlinking from other sites';
const RATELIMIT_DESC = 'rhine: /musiclab 40 req/min per IP';

const req = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.success !== false, status: r.status, j };
};

const zone = (await req('GET', '/zones?name=auak.dpdns.org')).j.result?.[0]?.id;
if (!zone) { console.log('找不到 zone'); process.exit(1); }
console.log('zone:', zone, APPLY ? '【写入模式】' : ROLLBACK ? '【回滚模式】' : '【dry-run】');

// ---------- 规则定义 ----------
const hotlinkRule = {
  action: 'block',
  description: HOTLINK_DESC,
  enabled: true,
  // 只挡"别的网站引用"：空 Referer（直接访问 / 应用同源请求）放行；本站域名放行
  expression: '(http.request.uri.path matches "^/musiclab/") and (http.referer ne "") and not (http.referer contains "auak.dpdns.org")',
};
const ratelimitRule = {
  action: 'block',
  description: RATELIMIT_DESC,
  enabled: true,
  expression: `(http.request.uri.path matches "^/musiclab/") and not (ip.src in {${HOME_NET}})`,
  ratelimit: { characteristics: ['ip.src'], period: 60, requests_per_period: 40, mitigation_timeout: 600 },
};

// ---------- 读出现状 ----------
const custom = await req('GET', `/zones/${zone}/rulesets/phases/http_request_firewall_custom/entrypoint`);
const rl = await req('GET', `/zones/${zone}/rulesets/phases/http_ratelimit/entrypoint`);
console.log('\n读取现状:');
console.log('  WAF 自定义规则:', custom.ok ? `✓ 可读（现有 ${(custom.j.result?.rules || []).length} 条）` : `✗ ${custom.j.errors?.[0]?.message || custom.status}`);
console.log('  速率限制规则  :', rl.ok ? `✓ 可读（现有 ${(rl.j.result?.rules || []).length} 条）` : `✗ ${rl.j.errors?.[0]?.message || rl.status}`);
if (!custom.ok || !rl.ok) {
  console.log('\n⚠️ token 缺少 WAF / Firewall 权限，无法执行。');
  console.log('   请在 Cloudflare → My Profile → API Tokens → 编辑该 token，加入：');
  console.log('     Zone → Zone WAF → Edit');
  console.log('     Zone → Firewall Services → Edit');
  console.log('   （或按下面对照表在面板里手点，参数完全一致）');
}

const existingHot = (custom.j?.result?.rules || []).find((r) => r.description === HOTLINK_DESC);
const existingRl = (rl.j?.result?.rules || []).find((r) => r.description === RATELIMIT_DESC);

if (ROLLBACK) {
  if (!existingHot && !existingRl) { console.log('\n没有找到本脚本加的规则，无需回滚 ✓'); process.exit(0); }
  const keepHot = { ...(custom.j.result || {}), rules: (custom.j.result?.rules || []).filter((r) => r.description !== HOTLINK_DESC) };
  const keepRl = { ...(rl.j.result || {}), rules: (rl.j.result?.rules || []).filter((r) => r.description !== RATELIMIT_DESC) };
  console.log('\n回滚：删掉', [existingHot && '防盗链', existingRl && '限流'].filter(Boolean).join(' + '));
  if (!APPLY) { console.log('（dry-run，加 --apply 才真的执行）'); process.exit(0); }
  console.log(await req('PUT', `/zones/${zone}/rulesets/${custom.j.result.id}`, { rules: keepHot.rules }));
  console.log(await req('PUT', `/zones/${zone}/rulesets/${rl.j.result.id}`, { rules: keepRl.rules }));
  process.exit(0);
}

console.log('\n将要写入的规则:');
console.log('  ① 防盗链:', JSON.stringify(hotlinkRule, null, 2).replace(/^/gm, '     '));
console.log('  ② 限流  :', JSON.stringify(ratelimitRule, null, 2).replace(/^/gm, '     '));
console.log(`\n  说明：正常听歌每首只有 1~4 次请求，40/分钟碰不到；你家网段 ${HOME_NET} 已豁免。`);

if (!APPLY) { console.log('\n（dry-run：加 --apply 才会真正写入）'); process.exit(0); }
if (!custom.ok || !rl.ok) { console.log('\n权限不足，无法写入 ✗'); process.exit(1); }

// ---------- 写入（保留已有规则，只追加/更新自己的那两条） ----------
const rulesHot = [...(custom.j.result.rules || []).filter((r) => r.description !== HOTLINK_DESC),
  existingHot ? { ...existingHot, ...hotlinkRule } : hotlinkRule];
const rulesRl = [...(rl.j.result.rules || []).filter((r) => r.description !== RATELIMIT_DESC),
  existingRl ? { ...existingRl, ...ratelimitRule } : ratelimitRule];

const r1 = await req('PUT', `/zones/${zone}/rulesets/${custom.j.result.id}`, { rules: rulesHot });
console.log('\n① 防盗链写入:', r1.ok ? '✓ 成功' : '✗ ' + JSON.stringify(r1.j.errors || r1.j).slice(0, 200));
const r2 = await req('PUT', `/zones/${zone}/rulesets/${rl.j.result.id}`, { rules: rulesRl });
console.log('② 限流写入  :', r2.ok ? '✓ 成功' : '✗ ' + JSON.stringify(r2.j.errors || r2.j).slice(0, 200));
console.log('\n回滚命令：node .dev/cf-apply-b.mjs --rollback --apply');
