// 限速验收：把网络压到 ~40KB/s（贴近校园网/联通那条线），看首次与二次加载的表现
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
let fails = 0, reqs = 0;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.requestWillBeSent') reqs++;
  if (m.method === 'Network.loadingFailed') fails++;
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 300000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'EXC' : r.result.value; };
const state = async () => ({
  面板: await ev(`document.querySelectorAll('iframe').length`),
  有画布: await ev(`[...document.querySelectorAll('iframe')].filter(f=>{try{return !!f.contentWindow.document.querySelector('canvas')}catch(e){return false}}).length`),
  曲库按钮: await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); return b ? getComputedStyle(b).display==='block' : false; })()`),
  缓存: await ev(`(async()=>{ const ks=await caches.keys(); const o=[]; for(const k of ks){const c=await caches.open(k); o.push(k.replace('rhine-v1-','')+'='+(await c.keys()).length);} return o.join(' '); })()`),
});

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });

console.log('=== 第 1 次：不限速，让它把壳装进 SW（模拟"某次网络好时的首访"）===');
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?sw=1&demo=1&slow=1' });
await sleep(40000);
console.log('  ', JSON.stringify(await state()));

console.log('\n=== 限速到 ~40KB/s + 200ms 延迟（模拟校园网/联通）===');
await send('Network.emulateNetworkConditions', { offline: false, latency: 200, downloadThroughput: Math.round(40 * 1024), uploadThroughput: Math.round(10 * 1024) });

console.log('\n=== 第 2 次加载（限速下，带 SW 缓存 + 重试）===');
fails = 0; reqs = 0;
const t0 = Date.now();
await send('Page.reload');
await sleep(60000);
const st = await state();
console.log(`  耗时 ${Math.round((Date.now() - t0) / 1000)}s  网络请求 ${reqs} 个  失败 ${fails} 个`);
console.log('  ', JSON.stringify(st));
console.log(`  → ${st.面板 === 10 && st.有画布 === 10 ? '**界面完整 ✓✓**' : '界面不完整 ✗'}`);

await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
