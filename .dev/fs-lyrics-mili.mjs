// 精确定位到 Mili 那首，验证「选目录」路径下歌词是否真的加载
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 120000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&fsly=1")');
await sleep(17000);

const NAMES = ['bombinsound.mp3', 'ethereal-bells.mp3', 'horror-hit.mp3', 'Mili - world.execute (me) ;.lrc',
  'Mili - world.execute (me) ;.mp3', 'military-radio-communication-222904.mp3', 'rock-cinematic.mp3',
  'speech.mp3', 'world.execute (me) ;.mid', 'world.execute(me)-timeline.lrc'];
await ev(`(function(){
  window.__FSMOCK__ = ${JSON.stringify(NAMES)};
  window.showDirectoryPicker = async () => ({ name: 'musiclab', async *entries() {
    for (const n of window.__FSMOCK__) yield [n, { kind: 'file', getFile: async () => new File([await (await fetch('/musiclab/' + encodeURIComponent(n))).blob()], n) }];
  } });
  return 'ok';
})()`);
await ev(`window.__RHINE_DEBUG__.loadFsLibrary().catch(e => e.message)`);
await sleep(1500);

const idx = await ev(`window.__RHINE_DEBUG__.LIB.tracks.findIndex(t => /Mili - world|world\\.execute/i.test(String(t.path || '') + String(t.title || '')))`);
console.log('Mili 下标:', idx, ' 路径:', await ev(`(window.__RHINE_DEBUG__.LIB.tracks[${idx}] || {}).path`));
await ev(`window.__RHINE_DEBUG__.playIndex(${idx})`);
await sleep(6000);
await S('send("view","lyrics"); "ok"');
await sleep(6000);
console.log('播放中:', await S(`JSON.stringify({ 播放: fb.IsPlaying, 时长: Math.round(fb.PlaybackLength), 曲目: fb.TitleFormat('%title%').Eval(true) || fb.TitleFormat('%filename%').Eval(true) })`));
console.log('主题怎么找歌词（同目录同名 .lrc）:', await S(`(function(){
  // 直接用刚播的那首的路径推 .lrc —— 这正是 lib/lyrics.js:51 loadLyrics 的第一步
  const p = ${JSON.stringify('D:\\\\musiclab\\\\Mili - world.execute (me) ;.mp3')};
  const lrc = p.replace(/\\.[^.\\\\]+$/, '.lrc');
  return JSON.stringify({ 音频路径: p, 推出来的歌词路径: lrc, IsFile: utils.IsFile(lrc), 文本首行: utils.ReadTextFile(lrc).split('\\n')[0] || '(空)', 行数: utils.ReadTextFile(lrc).split('\\n').length });
})()`));
console.log('歌词状态:', await S(`JSON.stringify({ state: LYR.state, key: LYR.key })`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\fs-lyrics-mili.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/fs-lyrics-mili.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
