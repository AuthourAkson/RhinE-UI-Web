// Service Worker 验收：首访 → 等缓存 → 播放一首（音频入缓存）→ 断网重载 → 必须还能开、还能播
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 130));
  if (m.method === 'Runtime.exceptionThrown') errs.push('[exception] ' + String(m.params.exceptionDetails.text).slice(0, 130));
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 240000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="transport"]').contentWindow.eval(${JSON.stringify(code)})`);
const cacheInfo = () => ev(`(async () => {
  const names = await caches.keys();
  const out = [];
  for (const n of names) { const c = await caches.open(n); const ks = await c.keys(); out.push(n + '=' + ks.length); }
  let est = null;
  try { const e2 = await navigator.storage.estimate(); est = (e2.usage / 1048576).toFixed(1) + 'MB/' + (e2.quota / 1048576).toFixed(0) + 'MB'; } catch (e) { }
  const reg = await navigator.serviceWorker.getRegistration();
  return JSON.stringify({ caches: out, usage: est, sw: reg ? (reg.active ? 'active' : 'installing') : 'none', controlled: !!navigator.serviceWorker.controller });
})()`);

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });

console.log('=== 第一次访问（?sw=1 显式启用）===');
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?sw=1' });
await sleep(32000);
console.log('  缓存状态:', await cacheInfo());
try { await ev(`navigator.storage.persist && navigator.storage.persist()`); } catch (e) { }
console.log('  等待后台预取影片帧…');
await sleep(45000);
console.log('  缓存状态:', await cacheInfo());

console.log('\n=== 播放一首，让音频进入缓存 ===');
let ok = false;
for (let i = 0; i < 20; i++) { ok = (await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); return b && getComputedStyle(b).display==='block'; })()`)) === true; if (ok) break; await sleep(1000); }
if (ok) {
  const r = JSON.parse(await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.left+q.width/2,y:q.top+q.height/2}); })()`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none', buttons: 0 }); await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(8000);
  await ev(`window.__RHINE_DEBUG__.playIndex(0)`);
  await sleep(12000);
  console.log('  播放中 =', await S('fb.IsPlaying'), ' 曲长 =', await S('fb.PlaybackLength'));
}
console.log('  缓存状态:', await cacheInfo());

console.log('\n=== 断网 + 重新加载（决定性验收）===');
errs.length = 0;
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await send('Page.reload');
await sleep(25000);
console.log('  断网后页面标题:', await ev('document.title'));
console.log('  面板数:', await ev(`document.querySelectorAll('iframe').length`), ' 有画布的:', await ev(`[...document.querySelectorAll('iframe')].filter(f=>{try{return !!f.contentWindow.document.querySelector('canvas')}catch(e){return false}}).length`));
console.log('  缓存状态:', await cacheInfo());
// 断网下播放（走 SW 的 Range 切片）
let played = null;
try {
  const okBtn = (await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); return b && getComputedStyle(b).display==='block'; })()`)) === true;
  if (okBtn) {
    const r = JSON.parse(await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.left+q.width/2,y:q.top+q.height/2}); })()`));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none', buttons: 0 }); await sleep(120);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(6000);
  }
  await ev(`window.__RHINE_DEBUG__.playIndex(0)`);
  await sleep(10000);
  played = { on: await S('fb.IsPlaying'), len: await S('fb.PlaybackLength'), t: await S('fb.PlaybackTime') };
} catch (e) { played = { err: String(e).slice(0, 80) }; }
console.log('  断网下播放:', JSON.stringify(played));
console.log('  断网阶段控制台错误:', errs.length, errs.slice(0, 3));
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
