// SIGNAL 视图最终验证（单会话）：正确双击播放 → 切 signal → 波形解码 → 动画帧差
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 60000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');
// 真正的双击：第二次点击 clickCount=2（浏览器才会合成 dblclick）
const dbl = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await sleep(50);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2, buttons: 0 });
  await sleep(600);
};
const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\' + name, Buffer.from(s.data, 'base64')); };

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&sigfin=1")');
await sleep(16000);

await S('send("view","playlists"); "ok"');
await sleep(2000);
const rows = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="playlist"]'), w = f.contentWindow, r = f.getBoundingClientRect(), out = [];
  for (const el of w.document.querySelectorAll('.prow')) { if (el.classList.contains('group')) continue; const b = el.getBoundingClientRect(); out.push({ x: Math.round(r.left + b.left + 120), y: Math.round(r.top + b.top + b.height / 2), t: el.textContent.trim().slice(0, 18) }); }
  return JSON.stringify(out);
})()`));
const target = rows[3] || rows[0];
console.log('双击:', target.t);
await dbl(target.x, target.y);
await sleep(1500);
console.log('播放:', await ev('JSON.stringify(window.__RHINE_DEBUG__.LIB.playing)'), await ev('JSON.stringify(window.__RHINE_DEBUG__.SHARED.transport.playing)'));
console.log('GetNowPlaying:', await S('(function(){ const h = fb.GetNowPlaying(); return h ? h.Path : "null"; })()'));

await S('send("view","signal"); "ok"');
for (const t of [1000, 2000, 3000]) {
  await sleep(1000);
  console.log(`+${t}ms:`, await S('JSON.stringify({ live: AUDIO.live, energy: +AUDIO.energy.toFixed(3), peak: +AUDIO.peakDb.toFixed(1), corr: +AUDIO.corr.toFixed(2), waveKey: Wave.key, loaded: Wave.loaded, waveMax: Wave.peaks ? +Math.max.apply(null, Array.from(Wave.peaks)).toFixed(3) : 0 })'));
}
await shot('signal-final-1.png');
await sleep(1500);
await shot('signal-final-2.png');
console.log('已存 signal-final-1.png / signal-final-2.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
