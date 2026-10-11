// 档案视图里搜索：应就地过滤货架（不建播放列表）
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const H = (code) => ev(`document.querySelector('iframe[data-id="header"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&asearch=1")');
await sleep(17000);
await S('send("view","archive"); "ok"');
await sleep(3000);
const state = () => S(`JSON.stringify({ 过滤词: typeof ARCHIVE_FILTER !== "undefined" ? ARCHIVE_FILTER : (typeof LIB !== "undefined" ? LIB.filter : "?"), 专辑数: (typeof LIB !== "undefined" ? LIB.albums.length : -1), 可见项: (typeof LIB !== "undefined" ? (LIB.unit === "tracks" ? LIB.items.length : LIB.albums.length) : -1) })`);
console.log('搜索前:', await state());
for (const q of ['world', 'mili', 'zzzz', '']) {
  await H(`(function(){ search.text = ${JSON.stringify(q)}; applySearch(); return 'ok'; })()`);
  await sleep(2500);
  console.log(`搜 "${q || '(空)'}" →`, await state(), ' 播放列表:', await ev('JSON.stringify(window.__RHINE_DEBUG__.LIB.playlists.map(p => p.name + "(" + p.items.length + ")"))'));
}
await H(`(function(){ search.text = 'world'; applySearch(); return 'ok'; })()`);
await sleep(2500);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\archive-search.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/archive-search.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
