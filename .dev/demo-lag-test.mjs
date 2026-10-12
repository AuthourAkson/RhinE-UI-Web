// 量化：切走 / 切回档案视图时，demo 按钮多久才消失 / 出现（目标：< 100ms）
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const btnState = () => ev(`(function(){ const b = document.getElementById('rhine-demo-btn'); return b ? getComputedStyle(b).display : '（无按钮）'; })()`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?lag=1' });
await sleep(22000);
console.log('初始（档案视图空态）:', await btnState());

// 切到播放列表：测消失耗时
let t0 = Date.now();
await S('send("view","playlists"); "ok"');
let gone = -1;
for (let i = 0; i < 120; i++) {
  if ((await btnState()) === 'none') { gone = Date.now() - t0; break; }
  await sleep(10);
}
console.log('切到播放列表 → 按钮消失耗时:', gone >= 0 ? gone + ' ms' : '超时（>1.2s）');

// 切回档案：测出现耗时
await sleep(1200);
t0 = Date.now();
await S('send("view","archive"); "ok"');
let shown = -1;
for (let i = 0; i < 120; i++) {
  if ((await btnState()) === 'block') { shown = Date.now() - t0; break; }
  await sleep(10);
}
console.log('切回档案视图 → 按钮出现耗时:', shown >= 0 ? shown + ' ms' : '超时（>1.2s）');
console.log('（这是 10ms 粒度的轮询测量，含 CDP 往返开销）');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
