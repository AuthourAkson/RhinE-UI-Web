// 抓博客首页（确认 RhinE 卡片已挂上）
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 90000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || '').slice(0, 160);
  return r.result.value;
};
const fs = await import('node:fs');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'https://auak.dpdns.org/' });
await sleep(12000);
console.log('标题:', await ev('document.title'));
console.log('卡片链接:', await ev(`JSON.stringify([...document.querySelectorAll('.card')].map(a => (a.querySelector('h3')||{}).textContent + ' → ' + a.getAttribute('href')))`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\blog-with-rhine.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/blog-with-rhine.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
