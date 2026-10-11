// 验证两件事：
//  ① 首选项对话框的滚动条是否跟随主题深色（含 color-scheme: dark 与自定义 thumb）
//  ② 「选目录」路径下同名 .lrc 歌词能否被识别（用假 DirectoryHandle，文件真的走 HTTP 读）
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
const H = (code) => ev(`document.querySelector('iframe[data-id="header"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&fsfix=1")');
await sleep(17000);

/* ---------------------------------------------------------------- ① 首选项滚动条 */
console.log('=== ① 首选项对话框的滚动条 ===');
const hit = JSON.parse(await H(`(function(){ const a = hits.get('prefs'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
const mx = fr.x + hit.x + hit.w / 2, my = fr.y + hit.y + hit.h / 2;
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my, button: 'none', buttons: 0 }); await sleep(200);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1, buttons: 1 }); await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1, buttons: 0 }); await sleep(800);
console.log('对话框:', await ev(`(function(){
  const w = document.getElementById('rhine-prefs');
  if (!w) return '（没打开）';
  const cs = getComputedStyle(w);
  return JSON.stringify({ colorScheme: cs.colorScheme, 有滚动条样式表: !!document.getElementById('rhine-prefs-sb'), 可滚动: (function(){ const b = w.firstChild; return b.scrollHeight > b.clientHeight; })() });
})()`));
const { execSync } = await import('node:child_process');
const box = JSON.parse(await ev(`(function(){ const b = document.getElementById('rhine-prefs').firstChild; const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.right - 30, y: r.top + 20, w: 30, h: 260 }); })()`));
const crop = await send('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 6 } });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\prefs-scrollbar.png', Buffer.from(crop.data, 'base64'));
console.log('已存 .dev/prefs-scrollbar.png（滚动条 6 倍放大）');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(500);

/* ------------------------------------------------- ② 选目录路径下的同名 .lrc */
console.log('\n=== ② 假目录选择器 → 同名 .lrc 是否可识别 ===');
const NAMES = ['bombinsound.mp3', 'ethereal-bells.mp3', 'horror-hit.mp3', 'Mili - world.execute (me) ;.lrc',
  'Mili - world.execute (me) ;.mp3', 'military-radio-communication-222904.mp3', 'rock-cinematic.mp3',
  'speech.mp3', 'world.execute (me) ;.mid', 'world.execute(me)-timeline.lrc'];
console.log(await ev(`(function(){
  window.__FSMOCK__ = ${JSON.stringify(NAMES)};
  window.showDirectoryPicker = async () => ({
    name: 'musiclab',
    async *entries() {
      for (const n of window.__FSMOCK__) {
        yield [n, { kind: 'file', getFile: async () => new File([await (await fetch('/musiclab/' + encodeURIComponent(n))).blob()], n) }];
      }
    },
  });
  return '假 picker 就绪';
})()`));
console.log('扫描:', await ev(`window.__RHINE_DEBUG__.loadFsLibrary().then(() => '完成').catch(e => 'ERR ' + e.message)`));
await sleep(1500);
console.log('宿主覆盖层:', await ev(`(function(){ const f = window.__RHINE_FS__; return f ? JSON.stringify({ files: f.files.size, text: f.text.size, 键样例: [...f.text.keys()].slice(0,3) }) : '（没建）'; })()`));
const LRC = 'D:\\\\musiclab\\\\Mili - world.execute (me) ;.lrc';
console.log('主题侧 IsFile:', await S(`utils.IsFile(${JSON.stringify(LRC).replace(/\\\\\\\\/g, '\\\\')})`));
console.log('主题侧 ReadTextFile 字节数:', await S(`utils.ReadTextFile(${JSON.stringify(LRC).replace(/\\\\\\\\/g, '\\\\')}).length`));
console.log('歌词首行:', await S(`(utils.ReadTextFile(${JSON.stringify(LRC).replace(/\\\\\\\\/g, '\\\\')}).split('\\n')[0] || '')`));

// 播放 Mili 那首 + 进歌词视图
const idx = await ev(`window.__RHINE_DEBUG__.LIB.tracks.findIndex(t => /Mili/i.test((t.title || '') + (t.path || '')))`);
console.log('Mili 在曲库里的下标:', idx);
if (idx >= 0) {
  await ev(`window.__RHINE_DEBUG__.playIndex(${idx})`);
  await sleep(7000);
  await S('send("view","lyrics"); "ok"');
  await sleep(7000);
  console.log('歌词模块状态:', await S(`JSON.stringify({ state: LYR.state, key: LYR.key, 正在播放: fb.IsPlaying, 标题: fb.TitleFormat('%title%').Eval(true) })`));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\fs-lyrics.png', Buffer.from(shot.data, 'base64'));
  console.log('已存 .dev/fs-lyrics.png');
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
