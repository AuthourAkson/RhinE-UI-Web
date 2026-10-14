// 用 Cloudflare 自己的统计判断"是谁的问题"：
//   edgeTimeToFirstByteMs —— 边缘处理耗时（服务器/边缘侧健康度）
//   originResponseDurationMs —— 回源耗时
// 若这两个都很小，而客户端直连却超时 → 问题在"客户端↔边缘"这段链路，不在服务端。
import fs from 'node:fs';
const TOKEN = fs.readFileSync('D:/Skill实验室/.secrets/cf-token.txt', 'utf8').trim();
const API = 'https://api.cloudflare.com/client/v4';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const gql = async (q, v) => { const r = await fetch(API + '/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query: q, variables: v }) }); const j = await r.json(); if (j.errors) console.log('  [错误]', JSON.stringify(j.errors[0]).slice(0, 180)); return j?.data?.viewer?.zones?.[0] || {}; };
const zone = (await (await fetch(`${API}/zones?name=auak.dpdns.org`, { headers: H })).json()).result[0].id;
const until = new Date(), since = new Date(until.getTime() - 6 * 3600e3);   // 最近 6 小时
const V = { zone, s: since.toISOString(), u: until.toISOString() };

const r = await gql(`query($zone:String!,$s:Time!,$u:Time!){ viewer { zones(filter:{zoneTag:$zone}) {
  httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$s, datetime_leq:$u}) {
    count
    quantiles { edgeTimeToFirstByteMsP50 edgeTimeToFirstByteMsP95 edgeTimeToFirstByteMsP99 }
  } } } }`, V);
const g = (r.httpRequestsAdaptiveGroups || [])[0];
console.log('=== 最近 6 小时，Cloudflare 边缘侧统计 ===');
if (!g) console.log('  （没有数据）');
else {
  const q = g.quantiles || {};
  console.log(`  请求数: ${g.count}`);
  console.log(`  边缘 TTFB（服务器/边缘处理耗时）: p50 ${q.edgeTimeToFirstByteMsP50}ms  p95 ${q.edgeTimeToFirstByteMsP95}ms  p99 ${q.edgeTimeToFirstByteMsP99}ms`);
  console.log('  → 若 p50 是几十毫秒级：服务端/边缘完全健康，慢只可能发生在"客户端↔边缘"这段。');
}
