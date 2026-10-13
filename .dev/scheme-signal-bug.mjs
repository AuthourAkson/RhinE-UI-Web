// 复现：非 archive 配色 + light 模式 → SIGNAL 中心环管线消失
// 抓 paint 异常 + 量中心画面像素 + 看 accentShift/Ring 的状态
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
    const s = m.params.args.map((a) => a.value !== undefined ? a.value : (a.description || '')).join(' ').slice(0, 220);
    if (t === 'error' || t === 'warning' || /paint|clock|hue|accent|ring/i.test(s)) logs.push(`[${t}] ${s}`);
  }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + String(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')).slice(0, 260));
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
// 环管线所在中心区域的"非背景像素"
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
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&scheme=1' });
await sleep(18000);
console.log('可用配色方案:', await S(`JSON.stringify(Object.keys(TOKENS.schemes))`));
await S('send("view","signal"); "ok"');
await sleep(4000);
console.log('archive + dark 中心像素:', await ink(), ' MODE=', await S('MODE'), ' SCHEME=', await S('SCHEME'));

for (const [scheme, mode] of [['archive', 'light'], ['flare', 'light'], ['flare', 'dark'], ['archive', 'dark']]) {
  await ev(`window.__RHINE_CMD__('import:${JSON.stringify({ scheme, mode })}')`);
  await sleep(5000);
  const st = await S(`JSON.stringify({ SCHEME: SCHEME, MODE: MODE, accentTurn: (function(){ try { return accentTurn(); } catch(e){ return 'EXC ' + e.message; } })(), ringMode: (function(){ try { return Ring.img.mode; } catch(e){ return '?'; } })(), shadow: (function(){ try { return Ring.img.shadow ? Ring.img.shadow.Width + 'x' + Ring.img.shadow.Height : '无'; } catch(e){ return '?'; } })() })`);
  console.log(`\n${scheme} / ${mode} → 中心像素 ${await ink()}   ${st}`);
}

console.log('\n=== 捕获到的日志（最后 14 条）===');
for (const l of logs.slice(-14)) console.log('   ' + l);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\scheme-signal.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/scheme-signal.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
