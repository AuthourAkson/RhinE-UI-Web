// 验证 Resize/StackBlur/Clone 修复：按 dark→light→dark→light→… 切换，每次量"非背景像素"并抓 paint 异常
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const paintErrs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const s = m.params.args.map((a) => a.value !== undefined ? a.value : (a.description || '')).join(' ').slice(0, 180);
    if (/paint|Resize|StackBlur|Clone is not/i.test(s)) paintErrs.push(`[${m.params.type}] ${s}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const s = String(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')).slice(0, 180);
    if (/paint|Resize|StackBlur/i.test(s)) paintErrs.push('[exception] ' + s);
  }
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
// 非背景像素 = 与画布左上角底色差得较远的采样点（两种模式下都成立）
const ink = () => ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow, cv = w.document.querySelector('canvas');
  const g = cv.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const i0 = 0, bg = [d[0], d[1], d[2]];
  let n = 0, tot = 0;
  for (let i = 0; i < d.length; i += 4 * 31) { tot++; if (Math.abs(d[i]-bg[0]) + Math.abs(d[i+1]-bg[1]) + Math.abs(d[i+2]-bg[2]) > 24) n++; }
  return JSON.stringify({ 非背景: n, 采样: tot, 底色: bg.join(',') });
})()`);
const fs = await import('node:fs');

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&ringfix=1' });
await sleep(18000);
await S('send("view","signal"); "ok"');
await sleep(4000);
console.log('起始 dark:', await ink(), ' MODE=', await S('MODE'));

for (let round = 1; round <= 3; round++) {
  await ev(`window.__RHINE_CMD__("mode:light")`);
  await sleep(5000);
  const l = await ink();
  console.log(`第 ${round} 次 → light:`, l, ' MODE=', await S('MODE'), ' 环阴影:', await S('JSON.stringify({ mode: Ring.img.mode, 有阴影: !!Ring.img.shadow, 阴影尺寸: Ring.img.shadow ? (Ring.img.shadow.Width + "x" + Ring.img.shadow.Height) : "-" })'));
  if (round === 1) {
    const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: 380, y: 180, width: 960, height: 560, scale: 1 } });
    fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\ring-light.png', Buffer.from(s.data, 'base64'));
  }
  await ev(`window.__RHINE_CMD__("mode:dark")`);
  await sleep(4000);
  console.log(`第 ${round} 次 → dark :`, await ink(), ' MODE=', await S('MODE'));
}
console.log('\npaint 相关异常/错误:', paintErrs.length, paintErrs.slice(0, 4));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
