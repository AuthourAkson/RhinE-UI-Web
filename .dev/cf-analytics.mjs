// 拉 auak.dpdns.org 的分析数据，判断是否有恶意爬虫 / 盗链 / 扫描
// 用 node 的 fetch（NODE_USE_ENV_PROXY=1 时走 HTTPS_PROXY；本机 curl 过代理不可靠，node 可以）
import fs from 'node:fs';

const TOKEN = fs.readFileSync('D:/Skill实验室/.secrets/cf-token.txt', 'utf8').trim();
const API = 'https://api.cloudflare.com/client/v4';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rest = async (path) => {
  const r = await fetch(API + path, { headers: H });
  return r.json();
};
const gql = async (query, variables) => {
  const r = await fetch(API + '/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) console.log('  [GraphQL 错误]', JSON.stringify(j.errors).slice(0, 300));
  return j;
};

// 1) 找 zone
const zs = await rest('/zones?name=auak.dpdns.org');
if (!zs.success || !zs.result.length) { console.log('找不到 zone:', JSON.stringify(zs).slice(0, 300)); process.exit(1); }
const zone = zs.result[0];
console.log(`zone: ${zone.name}  id=${zone.id}  plan=${zone.plan?.name}  状态=${zone.status}`);
console.log(`账号: ${zone.account?.name}`);

const until = new Date();
const since = new Date(until.getTime() - 7 * 24 * 3600 * 1000);
const T = { s: since.toISOString(), u: until.toISOString() };          // 变量名要和查询里声明的 $s/$u 一致
const D = { ds: since.toISOString().slice(0, 10), du: until.toISOString().slice(0, 10) };  // 1dGroups 要 YYYY-MM-DD
console.log(`统计区间: ${T.s.slice(0, 16)} → ${T.u.slice(0, 16)}（7 天，UTC）\n`);

// 2) 逐日总览
const daily = await gql(`query($zone:String!,$ds:String!,$du:String!){ viewer { zones(filter:{zoneTag:$zone}) {
  httpRequests1dGroups(limit:10, filter:{date_geq:$ds, date_leq:$du}, orderBy:[date_ASC]) {
    dimensions { date } sum { requests pageViews bytes threats cachedRequests } uniq { uniques }
  } } } }`, { zone: zone.id, ...D });
const days = daily?.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
console.log('=== 逐日总览 ===');
if (!days.length) console.log('  （这 7 天没有数据）');
for (const d of days) {
  const s = d.sum, u = d.uniq;
  console.log(`  ${d.dimensions.date}  请求 ${String(s.requests).padStart(7)}  独立IP ${String(u.uniques).padStart(5)}  页面浏览 ${String(s.pageViews).padStart(6)}  威胁 ${String(s.threats).padStart(4)}  流量 ${(s.bytes / 1048576).toFixed(1)} MB  缓存命中 ${s.cachedRequests}`);
}

// 3) 主机名分布（rhine. 是 Worker，其余是门户）
const hosts = await gql(`query($zone:String!,$s:Time!,$u:Time!){ viewer { zones(filter:{zoneTag:$zone}) {
  httpRequestsAdaptiveGroups(limit:20, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[count_DESC]) {
    count dimensions { clientRequestHTTPHost }
    sum { edgeResponseBytes }
  } } } }`, { zone: zone.id, ...T });
console.log('\n=== 主机名分布（谁在被访问）===');
for (const r of (hosts?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [])) {
  console.log(`  ${String(r.count).padStart(8)}  ${(r.sum.edgeResponseBytes / 1048576).toFixed(1).padStart(8)} MB  ${r.dimensions.clientRequestHTTPHost}`);
}
await sleep(400);

// 4) 最热的路径（盗链 / 扫描都能看出来）
const paths = await gql(`query($zone:String!,$s:Time!,$u:Time!){ viewer { zones(filter:{zoneTag:$zone}) {
  httpRequestsAdaptiveGroups(limit:25, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[count_DESC]) {
    count dimensions { clientRequestPath edgeResponseStatus }
    sum { edgeResponseBytes }
  } } } }`, { zone: zone.id, ...T });
console.log('\n=== 最热路径 TOP 25（看有没有被大量抓取的音频/页面）===');
for (const r of (paths?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [])) {
  const p = r.dimensions.clientRequestPath.length > 62 ? r.dimensions.clientRequestPath.slice(0, 59) + '...' : r.dimensions.clientRequestPath;
  console.log(`  ${String(r.count).padStart(7)}  ${String(r.dimensions.edgeResponseStatus).padStart(3)}  ${(r.sum.edgeResponseBytes / 1048576).toFixed(1).padStart(7)} MB  ${p}`);
}
await sleep(400);

// 5) User-Agent（爬虫最直接的证据）
const uas = await gql(`query($zone:String!,$s:Time!,$u:Time!){ viewer { zones(filter:{zoneTag:$zone}) {
  httpRequestsAdaptiveGroups(limit:25, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[count_DESC]) {
    count dimensions { userAgent }
  } } } }`, { zone: zone.id, ...T });
console.log('\n=== User-Agent TOP 25 ===');
for (const r of (uas?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [])) {
  const ua = (r.dimensions.userAgent || '(空)').slice(0, 70);
  console.log(`  ${String(r.count).padStart(7)}  ${ua}`);
}
await sleep(400);

// 6) 来源 IP / 国家 / ASN（单 IP 打满 = 恶意）
const ips = await gql(`query($zone:String!,$s:Time!,$u:Time!){ viewer { zones(filter:{zoneTag:$zone}) {
  httpRequestsAdaptiveGroups(limit:20, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[count_DESC]) {
    count dimensions { clientIP clientCountryName clientASNDescription }
    sum { edgeResponseBytes }
  } } } }`, { zone: zone.id, ...T });
console.log('\n=== 来源 IP TOP 20（单 IP 请求量异常 = 可疑）===');
for (const r of (ips?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [])) {
  console.log(`  ${String(r.count).padStart(7)}  ${(r.sum.edgeResponseBytes / 1048576).toFixed(1).padStart(7)} MB  ${String(r.dimensions.clientIP).padEnd(16)} ${r.dimensions.clientCountryName}  ${(r.dimensions.clientASNDescription || '').slice(0, 40)}`);
}
await sleep(400);

// 7) 安全事件（WAF / Bot Fight Mode 拦截记录）
const sec = await gql(`query($zone:String!,$s:Time!,$u:Time!){ viewer { zones(filter:{zoneTag:$zone}) {
  firewallEventsAdaptiveGroups(limit:20, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[count_DESC]) {
    count dimensions { action source clientRequestPath userAgent clientCountryName }
  } } } }`, { zone: zone.id, ...T });
const secRows = sec?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
console.log('\n=== 安全事件（被拦截/挑战的记录）===');
if (!secRows.length) console.log('  （没有安全事件：要么没被打，要么免费版没开 Bot Fight Mode / WAF 规则）');
for (const r of secRows) {
  console.log(`  ${String(r.count).padStart(6)}  ${String(r.dimensions.action).padEnd(10)} ${String(r.dimensions.source).padEnd(14)} ${(r.dimensions.clientRequestPath || '').slice(0, 40)}  ${(r.dimensions.userAgent || '').slice(0, 40)}`);
}

// 8) 4xx/5xx 比例（扫描器特征）
const st = await gql(`query($zone:String!,$s:Time!,$u:Time!){ viewer { zones(filter:{zoneTag:$zone}) {
  httpRequestsAdaptiveGroups(limit:10, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[count_DESC]) {
    count dimensions { edgeResponseStatus }
  } } } }`, { zone: zone.id, ...T });
console.log('\n=== 响应状态码分布 ===');
for (const r of (st?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [])) {
  console.log(`  ${String(r.count).padStart(8)}  ${r.dimensions.edgeResponseStatus}`);
}

// 9) 账号里这个 zone 的当前设置（Bot Fight Mode / 安全级别）—— 判断防护是否开着
const settings = await rest(`/zones/${zone.id}/settings`);
if (settings.success) {
  const want = ['security_level', 'browser_check', 'challenge_ttl', 'automatic_https_rewrites', 'ssl', 'always_use_https', 'min_tls_version'];
  console.log('\n=== 当前安全相关设置 ===');
  for (const s of settings.result.filter((x) => want.includes(x.id))) console.log(`  ${s.id.padEnd(26)} ${JSON.stringify(s.value)}`);
}
const bf = await rest(`/zones/${zone.id}/bot_management`);
console.log(`  bot_management             ${JSON.stringify(bf.result || bf.errors || bf).slice(0, 160)}`);
