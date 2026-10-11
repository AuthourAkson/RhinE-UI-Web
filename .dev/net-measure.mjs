// 用 CDP 的网络日志统计一次真实访问的传输量
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const reqs = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.responseReceived') reqs.set(m.params.requestId, { url: m.params.response.url, type: m.params.type, mime: m.params.response.mimeType });
  if (m.method === 'Network.loadingFinished') { const r = reqs.get(m.params.requestId); if (r) r.bytes = m.params.encodedDataLength; }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 90000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};

await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&net=1' });
await sleep(20000);

const rows = [...reqs.values()].map((r) => ({ url: r.url.replace(/^https?:\/\/[^/]+/, ''), type: r.type, kb: (r.bytes || 0) / 1024 }));
const total = rows.reduce((n, r) => n + r.kb, 0);
const byType = {};
for (const r of rows) byType[r.type] = (byType[r.type] || 0) + r.kb;
const manifest = rows.filter((r) => r.url.includes('__manifest'));
console.log('=== 一次访问（?demo=1，无缓存）===');
console.log('总请求数:', rows.length, ' 总传输:', total.toFixed(0), 'KB =', (total / 1024).toFixed(2), 'MB');
console.log('\n按类型:');
for (const [t, kb] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log('  ' + t.padEnd(12) + (kb / 1024).toFixed(2) + ' MB');
console.log('\n__manifest.json:', manifest.length, '次，共', (manifest.reduce((n, r) => n + r.kb, 0) / 1024).toFixed(2), 'MB',
  manifest.length ? '（单次 ' + (manifest[0].kb / 1024).toFixed(2) + ' MB）' : '');
console.log('\n传输量前 12 名:');
for (const r of rows.sort((a, b) => b.kb - a.kb).slice(0, 12)) console.log('  ' + String(Math.round(r.kb)).padStart(6) + ' KB  ' + r.type.padEnd(10) + r.url.slice(0, 78));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
