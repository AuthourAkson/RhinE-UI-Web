// 把播放列表面板整块 2 倍裁出来，直观看那块浅色
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 90000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const P = (code) => ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&crop=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);
if ((await P('STATE.preset')) !== 'album') { await ev(`document.querySelector('iframe[data-id="head"]').contentWindow.eval('send("preset"); "ok"')`); await sleep(2000); }
const f = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="playlist"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }); })()`));
console.log('播放列表面板（页面CSS）:', JSON.stringify(f));
const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: f.x, y: f.y, width: f.w, height: Math.min(f.h, 300), scale: 2 } });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\playlist-crop.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/playlist-crop.png（面板上半部分 2 倍）');

// 顺带把每个 .prow 的实际计算样式背景也列出（含 group 行）
console.log('\n各行背景:', await P(`JSON.stringify([...document.querySelectorAll('.prow')].filter(e => e.style.display !== 'none').map(e => ({ cls: e.className, bg: getComputedStyle(e).backgroundColor, top: e.style.top, h: e.style.height })), null, 0)`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
