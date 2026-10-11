// SIGNAL 视图验证：实时频谱（管线流动）+ 全曲波形（signal trace）
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
const click = async (x, y, n = 1) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await sleep(40);
  for (let k = 0; k < n; k++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: k + 1, buttons: 1 });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: k + 1, buttons: 0 });
    await sleep(70);
  }
  await sleep(500);
};
const audioState = () => ev(`(function(){
  const S = document.querySelector('iframe[data-id="stage"]').contentWindow;
  return S.eval(\`JSON.stringify({
    live: AUDIO.live, bands: Array.from(AUDIO.bands).filter(v => v > 0.01).slice(0, 6).map(v => +v.toFixed(3)),
    energy: +AUDIO.energy.toFixed(3), peakDb: +AUDIO.peakDb.toFixed(1), rmsDb: +AUDIO.rmsDb.toFixed(1), corr: +AUDIO.corr.toFixed(2),
    waveKey: Wave.key, waveLoaded: Wave.loaded, waveMax: Wave.peaks ? +Math.max(...Wave.peaks).toFixed(3) : 0,
  })\`);
})()`);
const graphState = () => ev(`JSON.stringify({ ac: !!window.__RHINE_AUDIO_PCM__, errors: (window.__ERRORS || []).slice(-3) })`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&sig=1")');
await sleep(17000);
console.log('启动后:', await graphState());

// 播放：档案视图点 PLAY ALBUM
await ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval('send("view","archive")')`);
await sleep(2500);
const play = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]'), r = f.getBoundingClientRect(), w = f.contentWindow;
  const a = w.eval("hits.get('ar-play')");
  return JSON.stringify(a ? { x: r.left + a.x + a.w / 2, y: r.top + a.y + a.h / 2 } : null);
})()`));
if (play) await click(play.x, play.y);
await sleep(1500);
console.log('播放中:', await ev('JSON.stringify(window.__RHINE_DEBUG__.SHARED.transport)'));

// 切到 SIGNAL 视图，等波形解码
await ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval('send("view","signal")')`);
await sleep(1500);
console.log('signal 1.5s:', await audioState());
await sleep(4000);
console.log('signal 5.5s:', await audioState());

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\signal-live.png', Buffer.from(shot.data, 'base64'));
await sleep(2000);
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\signal-live2.png', Buffer.from(shot2.data, 'base64'));
console.log('已存 signal-live.png / signal-live2.png（间隔 2 秒，应不同 → 说明管线在动）');
const diff = await ev(`(function(){
  const a = document.createElement('canvas'), b = document.createElement('canvas');
  return 'n/a';
})()`);
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
