// 验证：影片帧被限流到 ≤2 并发，且壳/主题 JS 不再被 144 帧的洪水饿死
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const sent = new Map();          // requestId -> {url, t}
const stats = { introActive: 0, introMax: 0, introDone: 0, shell: [], fails: [] };
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.requestWillBeSent') {
    const u = m.params.request.url;
    if (u.includes('/assets/intro/')) { stats.introActive++; stats.introMax = Math.max(stats.introMax, stats.introActive); sent.set(m.params.requestId, { intro: true }); }
    else if (/panel\.html|app\.js|shim\/shim\.js|__manifest|themes\/.*\.js/.test(u)) sent.set(m.params.requestId, { intro: false, url: u, t: Date.now() });
  }
  if (m.method === 'Network.loadingFinished') { const s = sent.get(m.params.requestId); if (s && s.intro) { stats.introActive = Math.max(0, stats.introActive - 1); stats.introDone++; } else if (s) stats.shell.push({ url: s.url, ms: Date.now() - s.t }); sent.delete(m.params.requestId); }
  if (m.method === 'Network.loadingFailed') { const s = sent.get(m.params.requestId); if (s && s.intro) { stats.introActive = Math.max(0, stats.introActive - 1); stats.introDone++; } else if (s) stats.fails.push(s.url); sent.delete(m.params.requestId); }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 240000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.text || '').slice(0, 120) : r.result.value; };

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?sw=1&demo=1&gate=1' });
await sleep(45000);
console.log('=== 影片帧并发情况 ===');
console.log(`  已发起的影片帧: ${stats.introMax === 0 ? '(还没有)' : stats.introDone + ' 完成 / 峰值并发 ' + stats.introMax}`);
console.log(`  → 峰值并发 ${stats.introMax} ${stats.introMax <= 2 ? '✓ 限流生效（≤2）' : '(未限流，浏览器默认约 6)'}`);
console.log('\n=== 壳类请求（决定能否进界面）完成耗时 ===');
const shell = stats.shell.sort((a, b) => b.ms - a.ms).slice(0, 8);
for (const s of shell) console.log(`  ${String(s.ms).padStart(6)}ms  ${s.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 56)}`);
console.log(`  壳类请求: 完成 ${stats.shell.length} 个，失败 ${stats.fails.length} 个`);
console.log('\n=== 界面是否可用 ===');
console.log('  面板数:', await ev(`document.querySelectorAll('iframe').length`), ' 有画布:', await ev(`[...document.querySelectorAll('iframe')].filter(f=>{try{return !!f.contentWindow.document.querySelector('canvas')}catch(e){return false}}).length`));
console.log('  载入音频库按钮可见:', await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); return b ? getComputedStyle(b).display === 'block' : false; })()`));
console.log('  缓存状态:', await ev(`(async()=>{ const ks=await caches.keys(); const o=[]; for(const k of ks){const c=await caches.open(k); o.push(k+'='+(await c.keys()).length);} return o.join(' '); })()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
