// 窄窗口下播放列表的列宽与标题是否还在
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 90000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 120);
  return r.result.value;
};
const P = (code) => ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.eval(${JSON.stringify(code)})`);
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);

await ev('location.assign("http://127.0.0.1:8300/?demo=1&narrow=1")');
await sleep(16000);
await S('send("view","playlists"); "ok"');
await sleep(2500);

for (const [w, h, dpr] of [[1707, 899, 1.5], [1280, 800, 1], [1100, 700, 1], [900, 620, 1]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  await sleep(2500);
  const info = await P(`(function(){
    const rows = [...document.querySelectorAll('.prow')].filter(r => r.style.display !== 'none' && !r.classList.contains('group'));
    const first = rows[0];
    const cells = first ? [...first.children].map(c => { const r = c.getBoundingClientRect(); return { 宽: Math.round(r.width), 文本: (c.textContent || '').trim().slice(0, 18) }; }) : [];
    const pl = document.querySelector('.prow');
    return JSON.stringify({ 行数: rows.length, 列: cells });
  })()`);
  console.log('窗口 ' + w + 'x' + h + ' @' + dpr + ' → ' + info);
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
