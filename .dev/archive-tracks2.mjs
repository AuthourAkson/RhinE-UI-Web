// 直接调用主题的 setUnit("tracks") 切到"每首曲子一个盒子"，看盒子上的名称
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 130);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&trk=1")');
await sleep(17000);
await S('send("view","archive"); "ok"');
await sleep(2500);
console.log('切到 TRACKS:', await S('setUnit("tracks"); JSON.stringify({ unit: LIB.unit, items: LIB.items.length, showTracks: showTracks() })'));
await sleep(3500);
console.log('每张"单曲卡片"的名称字段:', await S(`(function(){
  const out = [];
  for (const it of (showTracks() ? LIB.items : LIB.albums)) {
    out.push(JSON.stringify({ 标题: it.title, 艺人: it.artist, 专辑: it.album || it.albumTitle, albumArtist: it.albumArtist, 编号: it.no }));
  }
  return out.join('\\n');
})()`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\archive-unit-tracks.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/archive-unit-tracks.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
