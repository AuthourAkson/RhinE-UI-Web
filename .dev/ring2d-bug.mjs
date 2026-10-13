// 复现 SIGNAL 的 2D 模式问题：切 Ring.mode = 2d / classic，量像素 + 抓异常 + 截图
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const t = m.params.type;
    const s = m.params.args.map((a) => a.value !== undefined ? a.value : (a.description || '')).join(' ').slice(0, 260);
    if (t === 'error' || t === 'warning' || /paint|ring|clock|line/i.test(s)) logs.push(`[${t}] ${s}`);
  }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + String(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')).slice(0, 300));
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const ink = () => ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow, cv = w.document.querySelector('canvas');
  const g = cv.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const bg = [d[0], d[1], d[2]];
  let n = 0;
  for (let i = 0; i < d.length; i += 4 * 37) if (Math.abs(d[i]-bg[0]) + Math.abs(d[i+1]-bg[1]) + Math.abs(d[i+2]-bg[2]) > 24) n++;
  return n;
})()`);
const fs = await import('node:fs');

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&ring2d=1' });
await sleep(18000);
await S('send("view","signal"); "ok"');
await sleep(5000);
console.log('起始:', await S('JSON.stringify({ mode: Ring.mode })'), ' 中心像素:', await ink());

for (const mode of ['2d', 'classic', '3d', '2d']) {
  console.log(`\n--- 切到 ${mode} ---`);
  logs.length = 0;
  console.log('  设置:', await S(`(function(){ try { Ring.mode = ${JSON.stringify(mode)}; setSetting('ringMode', ${JSON.stringify(mode)}); window.Repaint(); return 'ok'; } catch(e){ return 'EXC ' + e.message; } })()`));
  await sleep(3500);
  console.log('  Ring.mode =', await S('Ring.mode'), ' 中心像素:', await ink());
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 300, y: 150, width: 1100, height: 620, scale: 1 } });
  fs.writeFileSync(`D:\\AgentTestLab\\RhinE-UI\\.dev\\ring-${mode}.png`, Buffer.from(shot.data, 'base64'));
  console.log('  日志:', logs.length ? logs.slice(0, 3).join(' | ').slice(0, 300) : '（无）');
}
console.log('\n已存 .dev/ring-2d.png / ring-classic.png / ring-3d.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
