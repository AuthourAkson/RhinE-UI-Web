// 关键安全确认：扫描者有没有**成功**拿到敏感文件（返回 2xx 的 .env/.git 等）
import fs from 'node:fs';
const TOKEN = fs.readFileSync('D:/Skill实验室/.secrets/cf-token.txt', 'utf8').trim();
const API = 'https://api.cloudflare.com/client/v4';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const gql = async (q, v) => { const r = await fetch(API + '/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query: q, variables: v }) }); const j = await r.json(); return j?.data?.viewer?.zones?.[0] || {}; };
const zone = (await (await fetch(`${API}/zones?name=auak.dpdns.org`, { headers: H })).json()).result[0].id;
const until = new Date(), since = new Date(until.getTime() - 7 * 864e5);
const V = { zone, s: since.toISOString(), u: until.toISOString() };
const Z = '$zone:String!,$s:Time!,$u:Time!';

const q = (pats) => `query(${Z}){ viewer { zones(filter:{zoneTag:$zone}) {
  httpRequestsAdaptiveGroups(limit:50, filter:{datetime_geq:$s, datetime_leq:$u, clientRequestPath_like:${JSON.stringify(pats)}}, orderBy:[count_DESC]) {
    count dimensions { clientRequestPath edgeResponseStatus clientIP }
  } } } }`;

console.log('=== 敏感路径的响应码（若出现 200 = 真泄露）===');
for (const pat of ['%.env%', '%/.git%', '%config.json%', '%.gitlab-ci.yml%', '%config.yaml%', '%.boto%', '%_environment%']) {
  const r = await gql(q(pat), V);
  const rows = r.httpRequestsAdaptiveGroups || [];
  const ok = rows.filter((x) => x.dimensions.edgeResponseStatus >= 200 && x.dimensions.edgeResponseStatus < 300);
  const sum = rows.reduce((a, b) => a + b.count, 0);
  console.log(`  ${pat.padEnd(20)} 匹配 ${String(sum).padStart(5)} 次，其中 **2xx = ${ok.length ? ok.map((o) => o.count + '×' + o.dimensions.edgeResponseStatus + ' ' + o.dimensions.clientRequestPath).join(', ') : '0 ✓ 无泄露'}**`);
  await new Promise((r) => setTimeout(r, 350));
}

console.log('\n=== 是否存在 5xx（被成功打崩/利用的迹象）===');
const sv = await gql(`query(${Z}){ viewer { zones(filter:{zoneTag:$zone}) {
  httpRequestsAdaptiveGroups(limit:10, filter:{datetime_geq:$s, datetime_leq:$u, edgeResponseStatus_geq:500}, orderBy:[count_DESC]) {
    count dimensions { edgeResponseStatus clientRequestPath }
  } } } }`, V);
const s5 = sv.httpRequestsAdaptiveGroups || [];
console.log(s5.length ? s5.map((x) => `  ${x.count} × ${x.dimensions.edgeResponseStatus} ${x.dimensions.clientRequestPath}`).join('\n') : '  没有 5xx ✓');

console.log('\n=== 唯一被大量抓取的内容（按流量排序的路径 TOP 10）===');
const tr = await gql(`query(${Z}){ viewer { zones(filter:{zoneTag:$zone}) {
  httpRequestsAdaptiveGroups(limit:10, filter:{datetime_geq:$s, datetime_leq:$u}, orderBy:[sum_edgeResponseBytes_DESC]) {
    count dimensions { clientRequestPath } sum { edgeResponseBytes }
  } } } }`, V);
for (const r of (tr.httpRequestsAdaptiveGroups || [])) console.log(`  ${(r.sum.edgeResponseBytes / 1048576).toFixed(1).padStart(8)} MB  ${String(r.count).padStart(6)} 次  ${r.dimensions.clientRequestPath.slice(0, 66)}`);
