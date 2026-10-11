// 验证歌词：播放 musiclab 里的 Mili 曲目 → LYRICS 视图应显示 LRC 歌词
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 150);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&lyr=1")');
await sleep(17000);
console.log('曲库:', await ev('JSON.stringify({ 曲目数: window.__RHINE_DEBUG__.LIB.tracks.length, 首曲路径: window.__RHINE_DEBUG__.LIB.tracks[0].path })'));
console.log('播放列表:', await ev('JSON.stringify(window.__RHINE_LIBRARY__.playlists.map(p => ({ 名: p.name, 数: p.items.length })))'));

// 播放 Mili 那首
await S('send("view","playlists"); "ok"');
let rows = [];
for (let i = 0; i < 20 && rows.length < 5; i++) {
  await sleep(700);
  const raw = await ev(`(function(){ const f=document.querySelector('iframe[data-id="playlist"]'); if(!f) return '[]'; const w=f.contentWindow; if(!w||!w.document.querySelector('.prow')) return '[]'; const r=f.getBoundingClientRect(),out=[]; for(const el of w.document.querySelectorAll('.prow')){ if(el.classList.contains('group'))continue; const b=el.getBoundingClientRect(); if(b.height<1)continue; out.push({x:Math.round(r.left+b.left+120),y:Math.round(r.top+b.top+b.height/2),t:el.textContent.trim().slice(0,26)}); } return JSON.stringify(out); })()`);
  try { rows = JSON.parse(raw); } catch (e) { rows = []; }
}
console.log('播放列表行:', rows.map((r) => r.t).join(' | '));
const mili = rows.find((r) => /world\.execute/i.test(r.t)) || rows[0];
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mili.x, y: mili.y, button: 'left', clickCount: 1, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mili.x, y: mili.y, button: 'left', clickCount: 1, buttons: 0 });
await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mili.x, y: mili.y, button: 'left', clickCount: 2, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mili.x, y: mili.y, button: 'left', clickCount: 2, buttons: 0 });
await sleep(2500);
console.log('正在播放:', await ev('JSON.stringify({ 播放: window.__RHINE_DEBUG__.SHARED.transport.playing, 路径: (fb => fb)(0) })') , await S('(function(){ const h = fb.GetNowPlaying(); return h ? h.Path : "null"; })()'));
console.log('歌词对象:', await S(`(function(){
  const L = T.lyrics;
  if (!L) return 'null（没读到歌词）';
  return JSON.stringify({ 来源: L.source, 行数: L.lines.length, 语言数: L.langs, 同步: L.synced, 前3行: L.lines.slice(0, 3).map(l => Math.round(l.t) + 's: ' + l.a.slice(0, 30)) });
})()`));
console.log('主题侧探针: (直接按路径查 .lrc)', await S(`(function(){
  const h = fb.GetNowPlaying(); if (!h) return '无曲目';
  const p = h.Path.replace(/\\.[^.\\\\]+$/, '') + '.lrc';
  return JSON.stringify({ 推出路径: p, IsFile: utils.IsFile(p), 前 60 字: utils.ReadTextFile(p, 65001).slice(0, 60) });
})()`));
await S('send("view","lyrics"); "ok"');
await sleep(2500);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\lyrics-view.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/lyrics-view.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
