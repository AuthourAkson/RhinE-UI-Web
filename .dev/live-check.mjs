// 线上验收：真实浏览器打开 rhine.auak.dpdns.org，看是否正常启动
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const reqs = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.responseReceived') reqs.set(m.params.requestId, { u: m.params.response.url, cc: m.params.response.headers['cache-control'] || '', cfs: m.params.response.headers['cf-cache-status'] || '', st: m.params.response.status });
  if (m.method === 'Network.loadingFinished') { const r = reqs.get(m.params.requestId); if (r) r.bytes = m.params.encodedDataLength; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(String((m.params.args[0] && m.params.args[0].value) || '').slice(0, 160));
  if (m.method === 'Runtime.exceptionThrown') errs.push(String(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')).slice(0, 160));
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 120000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160);
  return r.result.value;
};
const fs = await import('node:fs');

await send('Network.enable'); await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
console.log('打开线上站点…');
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/' });
await sleep(30000);

console.log('URL:', await ev('location.href'));
console.log('标题:', await ev('document.title'));
console.log('面板:', await ev(`JSON.stringify([...document.querySelectorAll('iframe')].map(f => f.dataset.id + (f.__ready ? '✓' : '✗')))`));
console.log('状态行:', await ev(`(function(){ const l = document.getElementById('log'); return l ? l.textContent : '?'; })()`));
console.log('错误数:', errs.length, errs.slice(0, 4));
const rows = [...reqs.values()].filter((r) => r.bytes !== undefined);
console.log('请求数:', rows.length, ' 传输:', (rows.reduce((n, r) => n + r.bytes, 0) / 1048576).toFixed(2), 'MB');
const mf = rows.find((r) => r.u.includes('__manifest'));
console.log('清单:', mf ? `${mf.st} ${(mf.bytes / 1024).toFixed(0)} KB cache=${mf.cc} cf=${mf.cfs}` : '（没有请求到）');
const ttf = rows.find((r) => r.u.includes('.ttf'));
console.log('字体:', ttf ? `${ttf.st} cache=${ttf.cc} cf=${ttf.cfs}` : '（没有）');
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\live-rhine.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/live-rhine.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
