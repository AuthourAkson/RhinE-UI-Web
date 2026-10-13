// 全矩阵验收：5 种配色 × light/dark，逐个量 SIGNAL 中心像素 + 抓异常
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
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&matrix=1' });
await sleep(18000);
await S('send("view","signal"); "ok"');
await sleep(4000);
const schemes = JSON.parse(await S('JSON.stringify(Object.keys(TOKENS.schemes))'));
console.log('配色:', schemes.join(', '));
let bad = 0;
for (const scheme of schemes) {
  const row = [];
  for (const mode of ['light', 'dark']) {
    await ev(`window.__RHINE_CMD__('import:${JSON.stringify({ scheme, mode })}')`);
    await sleep(4500);
    const v = await ink();
    row.push(`${mode}=${v}`);
    if (v < 3000) bad++;
  }
  console.log(`  ${scheme.padEnd(8)} ${row.join('   ')}   ${row.every((r) => Number(r.split('=')[1]) >= 3000) ? '✓' : '✗'}`);
}
// 顺便各视图回归
for (const v of ['archive', 'playlists', 'lyrics', 'style']) { await S(`send("view","${v}"); "ok"`); await sleep(2500); }
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\scheme-matrix.png', Buffer.from(shot.data, 'base64'));
console.log('\n异常中心像素的组合数:', bad, ' 控制台错误:', errs.length, errs.slice(0, 3));
console.log('已存 .dev/scheme-matrix.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
