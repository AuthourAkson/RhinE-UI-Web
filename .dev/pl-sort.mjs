// 播放列表：列标题排序 / LAYOUT 切换 / Shift 多选
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
const mods = (m) => m ? { modifiers: m } : {};
const click = async (x, y, opts = {}) => {
  const M = opts.shift ? 8 : opts.ctrl ? 2 : 0;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, modifiers: M });
  await sleep(50);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: opts.n || 1, buttons: 1, modifiers: M });
  await sleep(30);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: opts.n || 1, buttons: 0, modifiers: M });
  await sleep(450);
};
const order = () => ev(`JSON.stringify(window.__RHINE_DEBUG__.LIB.playlists[0].items)`);
const plRows = () => ev(`(function(){
  const f = document.querySelector('iframe[data-id="playlist"]'), w = f.contentWindow, r = f.getBoundingClientRect();
  return JSON.stringify([...w.document.querySelectorAll('.prow')].map(el => { const b = el.getBoundingClientRect(); return { t: el.textContent.trim().slice(0, 20), g: el.classList.contains('group'), x: Math.round(r.left + b.left + 80), y: Math.round(r.top + b.top + b.height / 2) }; }));
})()`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&pl3=1")');
await sleep(17000);
await ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval('send("view","playlists")')`);
await sleep(2500);

console.log('原始顺序:', await order());

// ① 点 head 的 TITLE 列标题 → 按标题排序
const colHit = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="head"]'), r = f.getBoundingClientRect(), w = f.contentWindow;
  const found = w.eval('(function(){ for (let y = H - 30; y < H; y += 3) for (let x = 0; x < W; x += 4) { const a = hits.at(x, y); if (a && a.id === "col" && a.data === "TITLE") return { x: a.x + a.w / 2, y: a.y + a.h / 2 }; } return null; })()');
  return JSON.stringify(found ? { x: r.left + found.x, y: r.top + found.y } : null);
})()`));
console.log('TITLE 列位置:', JSON.stringify(colHit));
if (colHit) { await click(colHit.x, colHit.y); console.log('排序后:', await order()); }

// ② Shift 多选：先点第一行，再 Shift+点第三行
const rows = JSON.parse(await plRows());
const items = rows.filter((r) => !r.g);
await click(items[0].x, items[0].y);
await click(items[2].x - 40, items[2].y, { shift: true });
console.log('Shift 多选:', await ev(`JSON.stringify(window.__RHINE_DEBUG__.LIB.selection)`));

// ③ LAYOUT [ALBUM|INDEX] 切换（head 的 preset 命中区）
const presetHit = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="head"]'), r = f.getBoundingClientRect(), w = f.contentWindow;
  const found = w.eval('(function(){ for (let y = 50; y < 90; y += 3) for (let x = W - 200; x < W; x += 4) { const a = hits.at(x, y); if (a && a.id === "preset" && a.data === "index") return { x: a.x + a.w / 2, y: a.y + a.h / 2 }; } return null; })()');
  return JSON.stringify(found ? { x: r.left + found.x, y: r.top + found.y } : null);
})()`));
console.log('INDEX 开关位置:', JSON.stringify(presetHit));
if (presetHit) {
  await click(presetHit.x, presetHit.y);
  await sleep(1500);
  console.log('切到 INDEX 后:', await ev(`(function(){
    const w = document.querySelector('iframe[data-id="playlist"]').contentWindow, h = document.querySelector('iframe[data-id="head"]').contentWindow;
    return JSON.stringify({
      预设: w.eval('STATE.preset'),
      我的列: w.eval('layout.map(c => c.c.title)'),
      head列: h.eval('columnLayout(presetMeta()).map(c => c.c.title)'),
      行数: w.eval('rows.length'), 组数: w.eval('rows.filter(r => r.group).length'),
      DOM: w.eval('[...document.querySelectorAll(".prow")].slice(0, 5).map(r => r.textContent.trim()).join(" | ")'),
    });
  })()`));
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\playlist-index.png', Buffer.from(s.data, 'base64'));
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
