// 验证：① 开场影片播放期间 demo 按钮不出现；影片结束后才出现 ② 文案已改
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const snap = () => ev(`(function(){
  const b = document.getElementById('rhine-demo-btn');
  const fx = document.querySelector('iframe[data-id="fx"]');
  return JSON.stringify({
    fx可见: fx ? getComputedStyle(fx).display : '?',
    按钮: b ? { 文案: b.textContent, display: getComputedStyle(b).display } : '（还没创建）',
  });
})()`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?intro=1' });
for (const t of [4000, 6000, 9000, 13000, 20000, 28000]) {
  await sleep(t === 4000 ? 4000 : 0);
  if (t !== 4000) await sleep(t - (t === 6000 ? 4000 : t === 9000 ? 6000 : t === 13000 ? 9000 : t === 20000 ? 13000 : 20000));
  console.log(`t≈${t}ms  ${await snap()}`);
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
