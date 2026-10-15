// 冷启动 + 限速验收（复现用户处境）：先清掉 SW 与所有缓存，再在 ~35KB/s 下加载
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
let reqs = 0, fails = 0; const failedUrls = [];
const urlById = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.requestWillBeSent') { reqs++; urlById.set(m.params.requestId, m.params.request.url); }
  if (m.method === 'Network.loadingFailed') { fails++; failedUrls.push((urlById.get(m.params.requestId) || '?').replace(/^https?:\/\/[^/]+/, '')); }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 300000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'EXC' : r.result.value; };

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?warmup=1' });
await sleep(6000);
console.log('=== ① 清空环境：注销 SW + 删掉所有缓存 + 清浏览器缓存 ===');
console.log('  ', await ev(`(async()=>{ const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.unregister(); const ks = await caches.keys(); for (const k of ks) await caches.delete(k); return '已注销 ' + rs.length + ' 个 SW，删除 ' + ks.length + ' 个缓存'; })()`));
await send('Network.clearBrowserCache');

console.log('\n=== ② 限速到 ~35KB/s + 300ms 延迟（模拟校园网/联通）===');
await send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: Math.round(35 * 1024), uploadThroughput: Math.round(10 * 1024) });

console.log('\n=== ③ 冷启动加载（这就是用户的处境）===');
reqs = 0; fails = 0; failedUrls.length = 0;
const t0 = Date.now();
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?sw=1&demo=1&cold=1' });
await sleep(180000);                       // 3 分钟：35KB/s 下 1MB 壳约需 30 秒，留足余量
const st = {
  面板: await ev(`document.querySelectorAll('iframe').length`),
  有画布: await ev(`[...document.querySelectorAll('iframe')].filter(f=>{try{return !!f.contentWindow.document.querySelector('canvas')}catch(e){return false}}).length`),
  加载中的面板: await ev(`[...document.querySelectorAll('iframe')].filter(f=>{try{return f.contentWindow.document.readyState!=='complete'}catch(e){return true}}).length`),
  缓存: await ev(`(async()=>{ const ks=await caches.keys(); const o=[]; for(const k of ks){const c=await caches.open(k); o.push(k.replace('rhine-v1-','')+'='+(await c.keys()).length);} return o.join(' ') || '(无)'; })()`),
  sw: await ev(`(async()=>{ const r = await navigator.serviceWorker.getRegistration(); return r ? (r.active ? 'active' : 'installing') : 'none'; })()`),
};
console.log(`  耗时 ${Math.round((Date.now() - t0) / 1000)}s   网络请求 ${reqs}   失败 ${fails}`);
console.log('  ', JSON.stringify(st));
if (failedUrls.length) console.log('  失败的 URL:', [...new Set(failedUrls)].slice(0, 6).join(', '));
console.log(`  → 面板完整: ${st.面板 === 10 && st.有画布 === 10 ? '**✓✓ 冷启动在烂线上也能进**' : '✗ 仍不完整'}`);

await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
