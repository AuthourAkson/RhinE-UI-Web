// 播放列表里逐行逐列 dump，找出哪一列为空
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
const P = (code) => ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.eval(${JSON.stringify(code)})`);
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&titles=1")');
await sleep(17000);

console.log('=== 宿主里的曲目数据 ===');
console.log(await ev(`JSON.stringify(window.__RHINE_DEBUG__.LIB.tracks.map((t, i) => ({ i, 标题: t.title, 艺人: t.artist, 专辑: t.album, 时长: t.length, 文件: String(t.path).split('\\\\').pop() })), null, 1)`));
console.log('\n=== 主题侧 TitleFormat 的输出（播放列表的列就用它）===');
console.log(await S(`(function(){
  const out = [];
  const L = window.__RHINE_LIBRARY__;
  for (let i = 0; i < L.tracks.length; i++) {
    const h = makeTrackHandle(i);
    if (!h) { out.push(i + ': 无句柄'); continue; }
    out.push(i + ': %title%="' + fb.TitleFormat('%title%').EvalWithMetadb(h) + '"  %artist%="' + fb.TitleFormat('%artist%').EvalWithMetadb(h) + '"  $if2(%title%,%filename%)="' + fb.TitleFormat('$if2(%title%,%filename%)').EvalWithMetadb(h) + '"');
  }
  return out.join('\\n');
})()`));

await S('send("view","playlists"); "ok"');
await sleep(3000);
console.log('\n=== 播放列表渲染出来的每一行（逐列）===');
console.log(await P(`(function(){
  const out = [];
  for (const el of document.querySelectorAll('.prow')) {
    if (el.style.display === 'none') continue;
    const cells = [...el.children].map(c => (c.textContent || '').trim());
    out.push((el.classList.contains('group') ? '[组] ' : '     ') + JSON.stringify(cells));
  }
  return out.join('\\n');
})()`));
console.log('\n=== 列定义与宽度 ===');
console.log(await P('JSON.stringify({ 预设: PRESET, 列: COL_FMT[PRESET] || COL_FMT.album })'));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\playlist-titles.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/playlist-titles.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
