// 播放长曲目（3:32），在播放中拍两帧并做像素差，证明管线在动
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
const dbl = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(50);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }); await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2, buttons: 0 }); await sleep(700);
};
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\' + n, Buffer.from(s.data, 'base64')); };

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&pipe=1")');
await sleep(16000);
await S('send("view","playlists"); "ok"');
let rows = [];
for (let i = 0; i < 20 && rows.length < 5; i++) {
  await sleep(800);
  const raw = await ev(`(function(){
    const f = document.querySelector('iframe[data-id="playlist"]'); if (!f) return '[]';
    const w = f.contentWindow; if (!w || !w.document.querySelector('.prow')) return '[]';
    const r = f.getBoundingClientRect(), out = [];
    for (const el of w.document.querySelectorAll('.prow')) { if (el.classList.contains('group')) continue; const b = el.getBoundingClientRect(); if (b.height < 1) continue; out.push({ x: Math.round(r.left + b.left + 120), y: Math.round(r.top + b.top + b.height / 2), t: el.textContent.trim().slice(0, 22) }); }
    return JSON.stringify(out);
  })()`);
  try { rows = JSON.parse(raw); } catch (e) { rows = []; }
}
const long = rows.find((r) => /world\.execute/i.test(r.t)) || rows[0];
console.log('播放长曲目:', long.t);
await dbl(long.x, long.y);
await sleep(1500);
await S('send("view","signal"); "ok"');
await sleep(2500);
for (let i = 0; i < 3; i++) {
  console.log(`  第${i + 1}次采样:`, await S('JSON.stringify({ t: +fb.PlaybackTime.toFixed(1), live: AUDIO.live, energy: +AUDIO.energy.toFixed(3), bands: Array.from(AUDIO.bands).filter(v=>v>0.05).length, peak: +AUDIO.peakDb.toFixed(1) })'));
  await shot(`pipe-${i + 1}.png`);
  await sleep(1200);
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
