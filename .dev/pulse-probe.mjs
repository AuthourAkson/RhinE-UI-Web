// 采样 Ring.pulses / AUDIO.bands 的逐帧变化（先导航到应用）
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 120);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const dbl = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2, buttons: 0 });
  await sleep(700);
};

await ev('location.assign("http://127.0.0.1:8300/?demo=1&pulse=1")');
await sleep(16000);
await S('send("view","playlists"); "ok"');
let rows = [];
for (let i = 0; i < 20 && rows.length < 5; i++) {
  await sleep(700);
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
console.log('播放:', long.t);
await dbl(long.x, long.y);
await sleep(1200);
await S('send("view","signal"); "ok"');
await sleep(2000);
for (let i = 0; i < 5; i++) {
  console.log(await S(`JSON.stringify({ t: +fb.PlaybackTime.toFixed(1), 模式: Ring.mode, 脉冲: Ring.pulses.map(p => +p.p.toFixed(3)), 脉冲数: Ring.pulses.length, 能量: +AUDIO.energy.toFixed(3), 涌动: +AUDIO.surge.toFixed(3), 频段前6: Array.from(AUDIO.bands).slice(0, 6).map(v => +v.toFixed(2)) })`));
  await sleep(1000);
}
ws.close();
