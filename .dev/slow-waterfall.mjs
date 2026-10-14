// 直连（国内家宽）加载线上应用，记录每个资源的耗时与失败，找出真正的瓶颈
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const failed = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.loadingFailed') failed.push({ id: m.params.requestId, err: m.params.errorText, canceled: m.params.canceled });
  if (m.method === 'Network.requestWillBeSent') failed.push({ req: m.params.requestId, url: m.params.request.url });
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 240000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
const t0 = Date.now();
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/' });
await sleep(90000);                      // 给足时间（链路差）
const t1 = Date.now();
console.log(`导航后等待 ${Math.round((t1 - t0) / 1000)}s\n`);

console.log('=== 页面内资源计时（最慢 18 条）===');
const res = await ev(`(function(){
  const rs = performance.getEntriesByType('resource').map(r => ({ n: r.name.replace(/^https?:\\/\\/[^/]+/, ''), ms: Math.round(r.duration), kb: +(r.transferSize/1024).toFixed(1), s: Math.round(r.startTime) }));
  rs.sort((a,b) => b.ms - a.ms);
  return JSON.stringify({ total: rs.length, slow: rs.slice(0, 18), sumKB: +(rs.reduce((a,b)=>a+b.kb,0)).toFixed(0) });
})()`);
const R = JSON.parse(res);
console.log(`  资源总数 ${R.total}，总下载 ${R.sumKB} KB`);
for (const r of R.slow) console.log(`  ${String(r.ms).padStart(7)}ms  ${String(r.kb).padStart(7)}KB  起于${String(r.s).padStart(6)}ms  ${r.n.slice(0, 58)}`);

console.log('\n=== 关键里程碑 ===');
console.log(await ev(`(function(){
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const out = { domContentLoaded: Math.round(nav.domContentLoadedEventEnd||0), load: Math.round(nav.loadEventEnd||0),
    ttfb: Math.round(nav.responseStart||0), transferKB: +((nav.transferSize||0)/1024).toFixed(1) };
  out.面板数 = document.querySelectorAll('iframe').length;
  out.有canvas的 = [...document.querySelectorAll('iframe')].filter(f => { try { return !!f.contentWindow.document.querySelector('canvas'); } catch(e){ return false; } }).length;
  out.还在加载 = [...document.querySelectorAll('iframe')].filter(f => { try { return f.contentWindow.document.readyState !== 'complete'; } catch(e){ return true; } }).length;
  return JSON.stringify(out);
})()`));

console.log('\n=== 失败/未完成的请求 ===');
const reqs = failed.filter((f) => f.url);
const fails = failed.filter((f) => f.err);
const byId = new Map(reqs.map((r) => [r.req, r.url]));
console.log(`  发起 ${reqs.length} 个请求，失败 ${fails.length} 个`);
for (const f of fails.slice(-12)) console.log(`  ✗ ${f.err.slice(0, 40).padEnd(42)} ${(byId.get(f.id) || '').replace(/^https?:\/\/[^/]+/, '').slice(0, 52)}`);
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
