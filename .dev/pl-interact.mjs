// 播放列表交互测试：点击选中 / 双击播放 / 方向键 / 体积
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
  await sleep(50);
  for (let k = 0; k < n; k++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: k + 1, buttons: 1 });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: k + 1, buttons: 0 });
    await sleep(80);
  }
  await sleep(400);
};
const state = () => ev(`(function(){
  const D = window.__RHINE_DEBUG__, w = document.querySelector('iframe[data-id="playlist"]').contentWindow;
  return JSON.stringify({
    focus: D.LIB.focus, selection: D.LIB.selection,
    playing: D.LIB.playing, isPlaying: D.SHARED.transport.playing,
    domRowSelected: w.eval('[...document.querySelectorAll(".prow")].filter(r => r.style.background && r.style.background !== "transparent").length'),
    headSize: document.querySelector('iframe[data-id="head"]').contentWindow.eval('plStats(0).size'),
    headLen: document.querySelector('iframe[data-id="head"]').contentWindow.eval('plStats(0).length'),
  });
})()`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&pl2=1")');
await sleep(17000);
await ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval('send("view","playlists")')`);
await sleep(2500);
console.log('初始:', await state());

// 找第 4 行（跳过前两个分组头）的页面坐标
const rows = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="playlist"]');
  const r = f.getBoundingClientRect();
  const w = f.contentWindow;
  const out = [];
  for (const el of w.document.querySelectorAll('.prow')) {
    const b = el.getBoundingClientRect();
    out.push({ text: el.textContent.trim().slice(0, 24), x: Math.round(r.left + b.left + 60), y: Math.round(r.top + b.top + b.height / 2), group: el.classList.contains('group') });
  }
  return JSON.stringify(out);
})()`));
console.log('行:', rows.map((r) => (r.group ? '[G]' : '   ') + r.text).join(' | '));

// ① 单击一个曲目行 → 焦点 + 单选
const item1 = rows.find((r) => !r.group);
await click(item1.x, item1.y);
console.log('单击后:', await state());

// ② 方向键 ↓ 移动焦点
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 40, key: 'ArrowDown', code: 'ArrowDown' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 40, key: 'ArrowDown', code: 'ArrowDown' });
await sleep(500);
console.log('↓ 之后:', await state());

// ③ 双击播放
const item2 = rows.filter((r) => !r.group)[2];
await click(item2.x, item2.y, 2);
await sleep(1200);
console.log('双击后:', await state());

const s = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\playlist-interact.png', Buffer.from(s.data, 'base64'));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
