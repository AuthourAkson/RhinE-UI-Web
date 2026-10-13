// 验证"载入默认音频库"按钮在手机视口下是否落在屏幕内且可点；并确认电脑端位置不变
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
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');
const btnInfo = () => ev(`(function(){
  const b = document.getElementById('rhine-demo-btn');
  if (!b) return 'null';
  const r = b.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
    visible: getComputedStyle(b).display, vw: innerWidth, vh: innerHeight,
    inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 });
})()`);

// ② 手机（先测，因为它才是有问题的那个）
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?empty=1' });
await sleep(26000);
await S('send("view","archive"); "ok"'); await sleep(6000);
console.log('【手机 844×390】按钮:', await btnInfo());
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\mobile-demo-btn.png', Buffer.from(shot.data, 'base64'));
// 触摸点它，看是否真的能载入
const t = JSON.parse(await btnInfo());
if (t && t !== 'null') {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t.x + t.w / 2, y: t.y + t.h / 2, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(9000);
  console.log('  触摸按钮后曲库文件数:', await ev(`window.__RHINE_DEBUG__.LIB.files.length`));
}
console.log('  手机端错误:', errs.length);

// 竖屏
errs.length = 0;
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?empty=1&p=1' });
await sleep(26000);
await S('send("view","archive"); "ok"'); await sleep(6000);
console.log('\n【手机竖屏 390×844】按钮:', await btnInfo());
console.log('  手机竖屏错误:', errs.length);

// ① 电脑（必须与改动前一致：按钮完全由主题坐标决定，scale=1）
errs.length = 0;
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?empty=1&d=1' });
await sleep(26000);
await S('send("view","archive"); "ok"'); await sleep(6000);
console.log('\n【电脑 1707×899】按钮:', await btnInfo());
const stageHit = await ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow, r = f.getBoundingClientRect();
  const h = w.eval('(function(){ try { return JSON.stringify(hits.get("ar-addmusic")); } catch(e){ return null; } })()');
  return h ? JSON.stringify({ rect: { left: r.left, top: r.top, width: r.width }, hit: JSON.parse(h) }) : 'null';
})()`);
console.log('  对照（主题命中区 + rect）:', stageHit);
console.log('  电脑端错误:', errs.length);
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
