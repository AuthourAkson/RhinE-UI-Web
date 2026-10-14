// 攻击画像：来源 IP / 安全事件 / 状态码 / 音频是否被批量抓取（重点查 /musiclab/*）
import fs from 'node:fs';
const TOKEN = fs.readFileSync('D:/Skill实验室/.secrets/cf-token.txt', 'utf8').trim();
const API = 'https://api.cloudflare.com/client/v4';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gql = async (query, variables) => {
  const r = await fetch(API + '/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) console.log('  [错误]', JSON.stringify(j.errors[0]).slice(0, 200));
  return j?.data?.viewer?.zones?.[0] || {};
};
const zone = (await (await fetch(`${API}/zones?name=auak.dpdns.org`, { headers: H })).json()).result[0].id;
const until = new Date(), since = new Date(until.getTime() - 7 * 864e5);
const V = { zone, s: since.toISOString(), u: until.toISOString() };
const Z = '$zone:String!,$s:Time!,$u:Time!';
const F = 'filter:{zoneTag:$zone}';
const log = [];
const p = (s) => { log.push(s); };

p('=== A) 来源 IP TOP 20（请求量/流量异常 = 爬虫或攻击）===');
const ips = await gql(`query(${Z}){ viewer { zones(${F}) {
  httpRequestsAdaptiveGroups(limit:20, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[count_DESC]) {
    count dimensions { clientIP clientCountryName } sum { edgeResponseBytes }
  } } } }`, V);
for (const r of (ips.httpRequestsAdaptiveGroups || [])) {
  p(`  ${String(r.count).padStart(7)} 次  ${(r.sum.edgeResponseBytes / 1048576).toFixed(1).padStart(8)} MB  ${String(r.dimensions.clientIP).padEnd(17)} ${r.dimensions.clientCountryName}`);
}
await sleep(350);

p('\n=== B) 安全事件（Cloudflare 判定为威胁/拦截的）===');
const sec = await gql(`query(${Z}){ viewer { zones(${F}) {
  firewallEventsAdaptiveGroups(limit:25, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[count_DESC]) {
    count dimensions { action source clientIP clientRequestPath userAgent }
  } } } }`, V);
const secRows = sec.firewallEventsAdaptiveGroups || [];
if (!secRows.length) p('  （没有安全事件记录）');
for (const r of secRows) {
  p(`  ${String(r.count).padStart(6)}  ${String(r.dimensions.action).padEnd(9)} ${String(r.dimensions.source).padEnd(12)} ${String(r.dimensions.clientIP || '').padEnd(16)} ${(r.dimensions.clientRequestPath || '').slice(0, 34).padEnd(34)} ${(r.dimensions.userAgent || '').slice(0, 34)}`);
}
await sleep(350);

p('\n=== C) 响应状态码分布 ===');
const st = await gql(`query(${Z}){ viewer { zones(${F}) {
  httpRequestsAdaptiveGroups(limit:12, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[count_DESC]) {
    count dimensions { edgeResponseStatus }
  } } } }`, V);
for (const r of (st.httpRequestsAdaptiveGroups || [])) p(`  ${String(r.count).padStart(8)}  ${r.dimensions.edgeResponseStatus}`);
await sleep(350);

p('\n=== D) 探扫路径（404/403 = 被扫描的证据）===');
const scan = await gql(`query(${Z}){ viewer { zones(${F}) {
  httpRequestsAdaptiveGroups(limit:25, filter:{datetime_geq:$s, datetime_leq:$u, edgeResponseStatus_in:[403,404]}, orderBy:[count_DESC]) {
    count dimensions { clientRequestPath edgeResponseStatus }
  } } } }`, V);
for (const r of (scan.httpRequestsAdaptiveGroups || [])) p(`  ${String(r.count).padStart(6)}  ${r.dimensions.edgeResponseStatus}  ${r.dimensions.clientRequestPath.slice(0, 70)}`);
await sleep(350);

p('\n=== E) 音频被抓取情况（/musiclab/* —— 决定 Workers 配额与盗链风险）===');
const au = await gql(`query(${Z}){ viewer { zones(${F}) {
  httpRequestsAdaptiveGroups(limit:25, filter:{datetime_geq:$s, datetime_leq:$u, clientRequestPath_like:"/musiclab/%"}, orderBy:[count_DESC]) {
    count dimensions { clientRequestPath clientIP clientCountryName } sum { edgeResponseBytes }
  } } } }`, V);
const auRows = au.httpRequestsAdaptiveGroups || [];
if (!auRows.length) p('  （这 7 天没有人请求过 /musiclab/*）');
let auTotal = 0, auBytes = 0, auByIp = {};
for (const r of auRows) {
  auTotal += r.count; auBytes += r.sum.edgeResponseBytes;
  auByIp[r.dimensions.clientIP] = (auByIp[r.dimensions.clientIP] || 0) + r.count;
  p(`  ${String(r.count).padStart(6)} 次  ${(r.sum.edgeResponseBytes / 1048576).toFixed(1).padStart(7)} MB  ${String(r.dimensions.clientIP).padEnd(17)} ${r.dimensions.clientCountryName}  ${r.dimensions.clientRequestPath.slice(0, 50)}`);
}
p(`  ---- /musiclab/* 合计 ${auTotal} 次、${(auBytes / 1048576).toFixed(1)} MB（Workers 配额按"请求数"算，免费 10 万/天）`);
const top = Object.entries(auByIp).sort((a, b) => b[1] - a[1]).slice(0, 5);
p(`  按 IP：${top.map(([ip, n]) => ip + '=' + n).join('  ')}`);

fs.writeFileSync('D:/AgentTestLab/RhinE-UI/.dev/attack-profile.txt', log.join('\n'), 'utf8');
console.log(log.join('\n'));
console.log('\n（已写入 .dev/attack-profile.txt）');
