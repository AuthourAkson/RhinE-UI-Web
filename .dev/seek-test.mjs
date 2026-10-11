// 验证进度条：点击跳转 + 释放后不再跟鼠标
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 100);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const T = (code) => ev(`document.querySelector('iframe[data-id="transport"]').contentWindow.eval(${JSON.stringify(code)})`);
const rectOf = (id) => ev(`(function(){ const r = document.querySelector('iframe[data-id="${id}"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }); })()`).then(JSON.parse);
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
const down = (x, y, n) => send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: n || 1, buttons: 1 });
const up = (x, y, n) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: n || 1, buttons: 0 });
const cur = async () => Number((await ev('window.__RHINE_DEBUG__.audio.currentTime')).toFixed(1));
const len = async () => Number((await ev('window.__RHINE_DEBUG__.SHARED.transport.length || 0')).toFixed(1));

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&seek2=1")');
await sleep(16000);

// 在播放列表里双击长曲目
await S('send("view","playlists"); "ok"');
let rows = [];
for (let i = 0; i < 20 && rows.length < 5; i++) {
  await sleep(700);
  const raw = await ev(`(function(){ const f=document.querySelector('iframe[data-id="playlist"]'); if(!f) return '[]'; const w=f.contentWindow; if(!w||!w.document.querySelector('.prow')) return '[]'; const r=f.getBoundingClientRect(),out=[]; for(const el of w.document.querySelectorAll('.prow')){ if(el.classList.contains('group'))continue; const b=el.getBoundingClientRect(); if(b.height<1)continue; out.push({x:Math.round(r.left+b.left+120),y:Math.round(r.top+b.top+b.height/2),t:el.textContent.trim().slice(0,22)}); } return JSON.stringify(out); })()`);
  try { rows = JSON.parse(raw); } catch (e) { rows = []; }
}
const long = rows.find((r) => /world\.execute/i.test(r.t)) || rows[0];
await move(long.x, long.y); await sleep(60);
await down(long.x, long.y, 1); await up(long.x, long.y, 1); await sleep(60);
await down(long.x, long.y, 2); await up(long.x, long.y, 2);
await sleep(2500);
console.log('播放:', await ev('JSON.stringify({ playing: window.__RHINE_DEBUG__.SHARED.transport.playing, time: +window.__RHINE_DEBUG__.SHARED.transport.time.toFixed(1), length: +window.__RHINE_DEBUG__.SHARED.transport.length.toFixed(1) })'));

// 进度条几何：面板内的 rulerGeom + 面板在页面里的位置
const g = JSON.parse(await T('JSON.stringify(rulerGeom())'));
const hit = JSON.parse(await T('(function(){ const a = hits.get("ruler"); return JSON.stringify(a ? { y: a.y, h: a.h } : null); })()'));
const fr = await rectOf('transport');
const y = fr.y + hit.y + hit.h / 2;
const xAt = (f) => fr.x + g.x0 + (g.x1 - g.x0) * f;
console.log('进度条: x0=' + Math.round(fr.x + g.x0) + ' x1=' + Math.round(fr.x + g.x1) + ' y=' + Math.round(y));

const L = await len();
for (const f of [0.25, 0.75, 0.5]) {
  const before = await cur();
  await move(xAt(f), y); await sleep(60);
  await down(xAt(f), y, 1); await sleep(80); await up(xAt(f), y, 1);
  await sleep(900);
  const after = await cur();
  console.log(`点击 ${(f * 100).toFixed(0)}% : ${before}s → ${after}s（期望 ≈ ${(L * f).toFixed(1)}s）  drag=${await T('drag ? "✗还在" : "null✓"')}`);
}

// 拖动：按下后移动 → 游标跟手（正常），松开后应停住
await move(xAt(0.3), y);
await down(xAt(0.3), y, 1); await sleep(100);
await move(xAt(0.6), y); await sleep(150);
const during = await T('drag ? drag.value.toFixed(1) : "无"');
await up(xAt(0.6), y, 1); await sleep(800);
const afterDrag = await cur();
await move(xAt(0.1), y); await sleep(500);
console.log(`拖动: 拖动中 drag.value=${during}s → 松开后 currentTime=${afterDrag}s（期望 ≈ ${(L * 0.6).toFixed(1)}s）；松开后再移动鼠标 → ${await cur()}s（应不变）`);
console.log('最终 drag:', await T('drag ? "✗还在" : "null ✓"'));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
