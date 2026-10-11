// 数值验证：线上 CSS 是否已更新为 232px，4 张卡片是否排在同一行
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
await send('Page.navigate', { url: 'https://auak.dpdns.org/?v=' + Date.now() });
await sleep(9000);
console.log('线上 style.css 里的 .cards 规则:', await ev(`(async () => {
  const t = await (await fetch('/style.css?v=' + Date.now())).text();
  const m = t.match(/\\.cards\\{[^}]*\\}/);
  return m ? m[0] : '（没找到）';
})()`));
console.log('\n4 张卡片的实际位置:', await ev(`(async () => {
  await new Promise(r => setTimeout(r, 500));
  const cs = [...document.querySelectorAll('.card')];
  return JSON.stringify(cs.map(a => ({ t: a.querySelector('h3').textContent, x: Math.round(a.getBoundingClientRect().left), y: Math.round(a.getBoundingClientRect().top), w: Math.round(a.getBoundingClientRect().width) })));
})()`));
console.log('\n是否同一行:', await ev(`(function(){ const ys = [...document.querySelectorAll('.card')].map(a => Math.round(a.getBoundingClientRect().top)); return new Set(ys).size === 1 ? '✓ 4 张同一行' : '✗ 分成 ' + new Set(ys).size + ' 行: ' + ys.join(','); })()`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
const out = 'D:\\AgentTestLab\\RhinE-UI\\.dev\\blog-cards-' + Date.now() + '.png';
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('已存', out);
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
