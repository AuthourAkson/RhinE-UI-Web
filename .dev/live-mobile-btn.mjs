// 线上手机端：载入音频库按钮是否在屏内 + 触摸可用
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 120));
  if (m.method === 'Runtime.exceptionThrown') errs.push('[exception] ' + String(m.params.exceptionDetails.text).slice(0, 120));
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const btn = () => ev(`(function(){
  const b = document.getElementById('rhine-demo-btn'); if (!b) return 'null';
  const r = b.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
    vw: innerWidth, vh: innerHeight, inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 });
})()`);
const fs = await import('node:fs');

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/' });
await sleep(7000);
await ev('localStorage.clear()');
await send('Page.reload');
await sleep(26000);
await S('send("view","archive"); "ok"'); await sleep(6000);
console.log('【线上手机横屏 844×390】按钮:', await btn());
const t = JSON.parse(await btn());
if (t && t !== 'null') {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t.x + t.w / 2, y: t.y + t.h / 2, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(10000);
  console.log('  触摸按钮后曲库文件数:', await ev(`window.__RHINE_DEBUG__.LIB.files.length`));
}
const s = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\live-mobile-btn.png', Buffer.from(s.data, 'base64'));
console.log('控制台错误:', errs.length, errs.slice(0, 2));
console.log('已存 .dev/live-mobile-btn.png');
await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
ws.close();
