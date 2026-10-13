// 确认 classic 的差异是否只是"没在播放"：线上载入 demo → 播放 → 再看 classic
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const ink = () => ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow, cv = w.document.querySelector('canvas');
  const g = cv.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const bg = [d[0], d[1], d[2]];
  let n = 0;
  for (let i = 0; i < d.length; i += 4 * 37) if (Math.abs(d[i]-bg[0]) + Math.abs(d[i+1]-bg[1]) + Math.abs(d[i+2]-bg[2]) > 24) n++;
  return n;
})()`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/' });
await sleep(6000);
await ev('localStorage.clear()');
await send('Page.reload');
await sleep(24000);
// 载入内置曲库
let ok = false;
for (let i = 0; i < 25; i++) { ok = (await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); return b && getComputedStyle(b).display==='block'; })()`)) === true; if (ok) break; await sleep(1000); }
if (ok) {
  const r = JSON.parse(await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.left+q.width/2,y:q.top+q.height/2}); })()`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none', buttons: 0 }); await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(8000);
}
await S('send("view","signal"); "ok"');
await sleep(3000);
console.log('播放前 classic:', await ink(), '（AUDIO.live =', await S('AUDIO.live'), '播放中 =', await S('fb.IsPlaying'), '）');
await ev(`window.__RHINE_DEBUG__.playIndex(0)`);
await sleep(8000);
for (const mode of ['classic', '2d', '3d']) {
  await S(`(function(){ Ring.mode = ${JSON.stringify(mode)}; window.Repaint(); return 'ok'; })()`);
  await sleep(3500);
  console.log(`播放中 ${mode.padEnd(8)} 中心像素=${await ink()}   能量=${await S('(AUDIO.energy||0).toFixed(3)')}`);
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
