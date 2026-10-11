// 验收：无曲库启动时，主题应当显示「+ ADD MUSIC FOLDER」入口（LIB.live = true）
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?empty=1' });
await sleep(20000);
await S('send("view","archive"); "ok"');
await sleep(2500);
console.log('宿主曲库状态:', await ev(`JSON.stringify({ ready: window.__RHINE_DEBUG__.LIB.ready, files: window.__RHINE_DEBUG__.LIB.files.length, tracks: window.__RHINE_DEBUG__.LIB.tracks.length })`));
console.log('主题侧:', await S(`JSON.stringify({ live: LIB.live, albums: LIB.albums ? LIB.albums.length : -1, tracks: LIB.tracks ? LIB.tracks.length : -1 })`));
console.log('是否给出「+ ADD MUSIC FOLDER」入口:', await S(`(function(){ const h = hits.get('ar-addmusic'); return h ? JSON.stringify(h) : '没有'; })()`));
console.log('当前空态文案区域:', await S(`(function(){ try { return String(LIB.live ? '已显示 NO ALBUMS 空态' : '仍在 INDEXING'); } catch (e) { return 'EXC'; } })()`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\dist-empty.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/dist-empty.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
