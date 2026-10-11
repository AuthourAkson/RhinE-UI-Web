// 多选测试：单击 / Shift 范围 / Ctrl 切换
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
const click = async (x, y, mod = 0) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, modifiers: mod });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1, modifiers: mod });
  await sleep(30);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0, modifiers: mod });
  await sleep(400);
};
const sel = () => ev(`JSON.stringify(window.__RHINE_DEBUG__.LIB.selection)`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&pl4=1")');
await sleep(17000);
await ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval('send("view","playlists")')`);
await sleep(2500);

const items = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="playlist"]'), w = f.contentWindow, r = f.getBoundingClientRect(), out = [];
  for (const el of w.document.querySelectorAll('.prow')) { if (el.classList.contains('group')) continue; const b = el.getBoundingClientRect(); out.push({ i: w.eval('0'), x: Math.round(r.left + b.left + 120), y: Math.round(r.top + b.top + b.height / 2), t: el.textContent.trim().slice(0, 16) }); }
  out.sort((a, b) => a.y - b.y);
  return JSON.stringify(out);
})()`));
console.log('可见曲目行:', items.map((r, k) => k + ':' + r.t).join('  '));

await click(items[0].x, items[0].y);
console.log('① 单击第 1 行   →', await sel());
await click(items[3].x, items[3].y, 8);   // Shift
console.log('② Shift 点第 4 行 →', await sel());
await click(items[5].x, items[5].y, 2);   // Ctrl
console.log('③ Ctrl 点第 6 行  →', await sel());
await click(items[5].x, items[5].y, 2);   // Ctrl 再点一次 = 取消
console.log('④ Ctrl 再点第 6 行 →', await sel());
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
