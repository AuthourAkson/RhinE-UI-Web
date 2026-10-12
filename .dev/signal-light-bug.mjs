// 复现：SIGNAL 视图里 dark → light 后中心画面消失。抓异常 + 量画布像素
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
    const s = m.params.args.map((a) => a.value !== undefined ? a.value : (a.description || '')).join(' ').slice(0, 200);
    if (t === 'error' || t === 'warning' || /clock|paint|audio-archive/i.test(s)) logs.push(`[${t}] ${s}`);
  }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + String(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')).slice(0, 300));
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

// 统计 stage 画布上"非背景色"的像素数（中心画面到底有没有画出来）
const ink = () => ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow, cv = w.document.querySelector('canvas');
  const g = cv.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4 * 37) { if (d[i] + d[i+1] + d[i+2] > 120) n++; }
  return JSON.stringify({ 采样亮像素: n, 画布: cv.width + 'x' + cv.height });
})()`);

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&sigbug=1' });
await sleep(18000);
await S('send("view","signal"); "ok"');
await sleep(5000);
console.log('=== 深色 SIGNAL ===');
console.log('  MODE:', await S('MODE'), ' 画布:', await ink());
console.log('  AUDIO:', await S(`JSON.stringify({ live: AUDIO.live, playing: fb.IsPlaying })`));

console.log('\n=== 切到 light ===');
await ev(`window.__RHINE_CMD__("mode:light")`);
await sleep(6000);
console.log('  MODE:', await S('MODE'), ' 画布:', await ink());
console.log('  AUDIO:', await S(`JSON.stringify({ live: AUDIO.live, playing: fb.IsPlaying })`));
console.log('  令牌色:', await S(`JSON.stringify({ bg: C.bg, fg: C.fg, accent: C.accent })`));
const shot1 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\signal-light.png', Buffer.from(shot1.data, 'base64'));

console.log('\n=== 切回 dark ===');
await ev(`window.__RHINE_CMD__("mode:dark")`);
await sleep(6000);
console.log('  MODE:', await S('MODE'), ' 画布:', await ink());
console.log('\n捕获到的日志（错误/clock/paint）:');
for (const l of logs.slice(-14)) console.log('   ' + l);
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
