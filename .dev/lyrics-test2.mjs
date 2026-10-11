// 复测歌词视图：不应再出现 FILE NOT FOUND 警告，BITRATE 应为 320 而不是 320,000
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
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');
const dbl = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2, buttons: 0 });
  await sleep(700);
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&lyr2=1")');
await sleep(17000);
console.log('曲库首曲（应是真实路径）:', await ev('window.__RHINE_DEBUG__.LIB.tracks[0].path'));
await S('send("view","playlists"); "ok"');
let rows = [];
for (let i = 0; i < 20 && rows.length < 5; i++) {
  await sleep(700);
  const raw = await ev(`(function(){ const f=document.querySelector('iframe[data-id="playlist"]'); if(!f) return '[]'; const w=f.contentWindow; if(!w||!w.document.querySelector('.prow')) return '[]'; const r=f.getBoundingClientRect(),out=[]; for(const el of w.document.querySelectorAll('.prow')){ if(el.classList.contains('group'))continue; const b=el.getBoundingClientRect(); if(b.height<1)continue; out.push({x:Math.round(r.left+b.left+120),y:Math.round(r.top+b.top+b.height/2),t:el.textContent.trim().slice(0,26)}); } return JSON.stringify(out); })()`);
  try { rows = JSON.parse(raw); } catch (e) { rows = []; }
}
const mili = rows.find((r) => /world\.execute/i.test(r.t)) || rows[0];
await dbl(mili.x, mili.y);
await sleep(2500);
console.log('IsFile(曲目) =', await S('utils.IsFile(fb.GetNowPlaying().Path)'));
console.log('T.missing =', await S('T.missing'));
console.log('歌词:', await S('T.lyrics ? T.lyrics.source + " / " + T.lyrics.lines.length + " 行 / 同步=" + T.lyrics.synced : "null"'));
console.log('卡片 bitrate 字段 =', await S('T.info ? T.info.bitrate : "?"'), '（foobar 的 %bitrate% 单位是 kbps，应是 320）');
await S('send("view","lyrics"); "ok"');
await sleep(3000);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\lyrics-view2.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/lyrics-view2.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
