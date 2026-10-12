// 验证：加载条在加载完毕后自动隐藏；Alt+H 能唤回；文本仍可读（测试不受影响）
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 120000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const hudState = () => ev(`(function(){ const h = document.getElementById('hud'); if (!h) return '（没有 HUD）';
  const cs = getComputedStyle(h);
  return JSON.stringify({ display: cs.display, opacity: cs.opacity, 文本: document.getElementById('log').textContent.slice(0, 40) }); })()`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&hud=1")');
await sleep(6000);
console.log('启动 6s（加载中，应可见）:', await hudState());
await sleep(14000);
console.log('启动 20s（应已自动隐藏）:', await hudState());

// Alt+H 唤回：焦点故意留在面板里（模拟真实情况）
await ev(`document.querySelector('iframe[data-id="header"]').contentWindow.focus()`);
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 });
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72, modifiers: 1 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72, modifiers: 1 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 0 });
await sleep(700);
console.log('按 Alt+H 后:', await hudState());
await sleep(5200);
console.log('再等 5s（应再次自动隐藏）:', await hudState());
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
