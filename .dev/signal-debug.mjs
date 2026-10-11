// 单会话：加载 → 播放 → signal → 直接调 GetWaveformAsync 看错误 → 截图
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
const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(400);
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&sigdbg=1")');
await sleep(16000);

// 播放一首（用 playlist 双击，保证是"换曲"）
await S('send("view","playlists"); "ok"');
await sleep(2000);
const row = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="playlist"]'), w = f.contentWindow, r = f.getBoundingClientRect();
  for (const el of w.document.querySelectorAll('.prow')) { if (el.classList.contains('group')) continue; const b = el.getBoundingClientRect(); return JSON.stringify({ x: r.left + b.left + 120, y: r.top + b.top + b.height / 2, t: el.textContent.trim().slice(0, 20) }); }
  return 'null';
})()`));
console.log('双击行:', JSON.stringify(row));
if (row && row.x) { await click(row.x, row.y); await sleep(200); await click(row.x, row.y); }
await sleep(1500);
console.log('播放:', await ev('JSON.stringify(window.__RHINE_DEBUG__.SHARED.transport.playing)'));

console.log('GetWaveformAsync 直调:', await S(`(async function(){
  try {
    const hh = fb.GetNowPlaying();
    if (!hh) return 'GetNowPlaying 是 null';
    const t0 = Date.now();
    const r = await utils.GetWaveformAsync(hh, 64, 0, 0, () => true);
    return 'ok len=' + r.length + ' max=' + Math.max.apply(null, Array.from(r)).toFixed(4) + ' ms=' + (Date.now() - t0);
  } catch (e) { return 'ERR ' + (e && (e.message || e)); }
})()`));
console.log('来源:', await S(`(function(){ const t = (window.__RHINE_LIBRARY__ || {}).tracks[3]; return t ? JSON.stringify({ url: t.url, file: !!t.file }) : 'no'; })()`));
console.log('AC:', await S(`(function(){ try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return 'no AC'; const ac = new AC(); return 'state=' + ac.state + ' rate=' + ac.sampleRate; } catch (e) { return 'ERR ' + e.message; } })()`));

// 切到 signal 看整体
await S('send("view","signal"); "ok"');
await sleep(3500);
console.log('signal 状态:', await S('JSON.stringify({ live: AUDIO.live, energy: +AUDIO.energy.toFixed(3), waveKey: Wave.key, loaded: Wave.loaded })'));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\signal-live.png', Buffer.from(shot.data, 'base64'));
console.log('已存 signal-live.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
