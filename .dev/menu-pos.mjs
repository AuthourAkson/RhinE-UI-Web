// 读子菜单位置日志，定位偏移原因
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const H = (code) => ev(`document.querySelector('iframe[data-id="header"]').contentWindow.eval(${JSON.stringify(code)})`);
const rows = () => ev(`(function(){
  const out = [];
  const walk = (box) => { for (const row of box.children) { if (row.style && row.style.position === 'fixed') { walk(row); continue; } const b = row.getBoundingClientRect(); if (b.width > 1) out.push({ t: (row.textContent||'').trim().slice(0,22), x: b.left + b.width/2, y: b.top + b.height/2, l: Math.round(b.left), tp: Math.round(b.top) }); } };
  for (const box of [...document.body.children]) if (box.style && box.style.position === 'fixed') walk(box);
  return JSON.stringify(out);
})()`).then((s) => { try { return JSON.parse(s); } catch (e) { return []; } });
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(280); };

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&pos=1")');
await sleep(17000);
await ev('window.__MENU_LOG__ = []');
const hit = JSON.parse(await H(`(function(){ const a = hits.get('menu'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fr.x + hit.x + hit.w / 2, y: fr.y + hit.y + hit.h / 2, button: 'none', buttons: 0 });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fr.x + hit.x + hit.w / 2, y: fr.y + hit.y + hit.h / 2, button: 'left', clickCount: 1, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fr.x + hit.x + hit.w / 2, y: fr.y + hit.y + hit.h / 2, button: 'left', clickCount: 1, buttons: 0 });
await sleep(900);
console.log('顶层菜单:'); console.log(JSON.stringify(await rows(), null, 1).slice(0, 600));
const aa = (await rows()).find((r) => /Audio Archive/.test(r.t));
await move(aa.x, aa.y);
await sleep(800);
const lv2 = await rows();
console.log('\n第二层前 6 行:', JSON.stringify(lv2.slice(-8)));
console.log('\n=== 子菜单位置日志 ===');
console.log(await ev('JSON.stringify(window.__MENU_LOG__, null, 1)'));
console.log('\n窗口尺寸:', await ev('JSON.stringify({ iw: innerWidth, ih: innerHeight })'));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
