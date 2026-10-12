// 重建 dist 后：截「空库空态 + 两个按钮并存」的画面，确认 demo 按钮位置正确
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 120000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?two=1' });
await sleep(22000);
console.log('主题 ADD 命中区(stage 内):', await S(`JSON.stringify(hits.get('ar-addmusic') || null)`));
console.log('demo 按钮:', await ev(`(function(){ const b = document.getElementById('rhine-demo-btn'); if (!b) return '（无）'; const r = b.getBoundingClientRect(); return JSON.stringify({ display: getComputedStyle(b).display, 页面坐标: Math.round(r.left)+','+Math.round(r.top), 尺寸: Math.round(r.width)+'x'+Math.round(r.height) }); })()`));
console.log('stage 面板页面坐标:', await ev(`(function(){ const f = document.querySelector('iframe[data-id="stage"]'); const r = f.getBoundingClientRect(); return JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }); })()`));
// 裁两个按钮所在区域放大
const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 470, y: 400, width: 460, height: 180, scale: 3 } });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\two-buttons.png', Buffer.from(shot.data, 'base64'));
const full = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\demo-empty.png', Buffer.from(full.data, 'base64'));
console.log('已存 .dev/two-buttons.png（放大 3 倍）与 .dev/demo-empty.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
