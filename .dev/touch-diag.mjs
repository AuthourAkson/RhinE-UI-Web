// 触摸桥接诊断：点画布后看主题的中间状态 AR.hover 是否被设置
//   AR.hover >= 0 → mousemove 送到了（桥接生效）
//   AR.hover = -1 → on_mouse_move 根本没被调用（桥接没生效）
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

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&diag=1' });
await sleep(22000);
await S('send("view","archive"); "ok"'); await sleep(3500);

const pos = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]');
  const r = f.getBoundingClientRect(), w = f.contentWindow;
  const vw = w.eval('(function(){ try { return W; } catch(e){ return 1440; } })()');
  const s = r.width / vw;
  const h = w.eval('(function(){ try { const q = AR.hits[0].quad; return JSON.stringify({cx:(q[0][0]+q[2][0])/2, cy:(q[0][1]+q[2][1])/2}); } catch(e){ return null; } })()');
  const q = h ? JSON.parse(h) : null;
  return JSON.stringify({ left: r.left, top: r.top, s: s, cx: q && q.cx, cy: q && q.cy });
})()`));
const px = pos.left + pos.cx * pos.s, py = pos.top + pos.cy * pos.s;
console.log('虚拟坐标', Math.round(pos.cx), Math.round(pos.cy), '→ 页面坐标', Math.round(px), Math.round(py), ' 缩放', pos.s.toFixed(4));
console.log('触摸前: AR.hover =', await S('AR.hover'), ' AR.hoverTick =', await S('AR.hoverTick'));

// —— 触摸（走 shim 桥接）
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py, id: 1 }] });
await sleep(120);
console.log('touchStart 后: AR.hover =', await S('AR.hover'), '  （≥0 = mousemove 送到了 ✓）');
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(300);
console.log('touchend 后: AR.selAlbum =', String(await S('AR.selAlbum')).slice(0, 34));

// —— 对照：鼠标事件（桌面路径）在同样的位置
await S('(function(){ AR.hover = -1; AR.hoverTick = -1; return "reset"; })()');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, button: 'none', buttons: 0 });
await sleep(150);
console.log('\n对照（鼠标）移动后: AR.hover =', await S('AR.hover'), '  （应该 ≥0）');
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1, buttons: 1 });
await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1, buttons: 0 });
await sleep(2500);
console.log('对照（鼠标）点击后: AR.selAlbum =', String(await S('AR.selAlbum')).slice(0, 34));
await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
ws.close();
