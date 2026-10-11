// 在用户的实际环境（1707×899 CSS @ dpr1.5）下，对比 ALBUMS / TRACKS 两种显示模式
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 40000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const fs = await import('node:fs');
const state = () => ev(`(function(){
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  return w.eval(\`JSON.stringify({
    unit: LIB.unit, layout: AR.layout, groupBy: LIB.groupBy,
    albums: LIB.albums.length, items: LIB.items.length,
    groups: LIB.groups.length, shelves: SHELVES.length,
    shelfAlbums: SHELVES.map(s => s.albums.length),
    slotsInView: slotsInView(), arK: +arK().toFixed(3),
    drawnCases: (function(){ const r = AR.rows.get(AR.group); return r ? r.cases.size : -1; })(),
  })\`);
})()`);
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\' + name, Buffer.from(s.data, 'base64'));
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&modes=1")');
await sleep(17000);
console.log('ALBUMS:', await state());
await shot('mode-albums-1707.png');

await ev(`(function(){ document.querySelector('iframe[data-id="stage"]').contentWindow.eval("setUnit('tracks')"); })()`);
await sleep(4000);
console.log('TRACKS:', await state());
await shot('mode-tracks-1707.png');

await ev(`(function(){ document.querySelector('iframe[data-id="stage"]').contentWindow.eval("setUnit('albums')"); })()`);
await sleep(2000);
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
