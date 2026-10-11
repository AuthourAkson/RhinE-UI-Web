// 定位：ActiveXObject 是否可用、主题的菜单代码是否被触发
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 150);
  return r.result.value;
};
const H = (code) => ev(`document.querySelector('iframe[data-id="header"]').contentWindow.eval(${JSON.stringify(code)})`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&dbg=1")');
await sleep(17000);

console.log('=== ActiveXObject ===');
console.log(await H(`(function(){
  const out = { 存在: typeof ActiveXObject, window上有: typeof window.ActiveXObject };
  try { const sh = new ActiveXObject('WScript.Shell'); out.RegRead = sh.RegRead('HKCU\\\\Control Panel\\\\Desktop\\\\PreferredUILanguages'); }
  catch (e) { out.错误 = e.message; }
  try { out.systemLang直接调用 = systemLang(); } catch (e) { out.systemLang错误 = e.message; }
  out.navigator = navigator.language;
  return JSON.stringify(out);
})()`));

console.log('\n=== 主题的菜单是否被触发（猴补 CreatePopupMenu / TrackPopupMenu）===');
await H(`(function(){
  window.__menuLog = { popups: 0, tracks: 0, items: 0 };
  const orig = window.CreatePopupMenu;
  window.CreatePopupMenu = function(){ window.__menuLog.popups++; const p = orig(); const ot = p.TrackPopupMenu; p.TrackPopupMenu = function(x,y,f){ window.__menuLog.tracks++; window.__menuLog.last = { x, y, items: p.__items ? p.__items.length : -1, titles: (p.__items||[]).map(i=>i.text).slice(0,14) }; return ot.call(p, x, y, f); }; return p; };
  return 'patched';
})()`);
const hit = JSON.parse(await H(`(function(){ const a = hits.get('menu'); return JSON.stringify(a ? { x: a.x, y: a.y, w: a.w, h: a.h } : null); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
console.log('menu 命中区:', JSON.stringify(hit));
const mx = fr.x + hit.x + hit.w / 2, my = fr.y + hit.y + hit.h / 2;
for (const kind of ['down', 'up']) {
  await send('Input.dispatchMouseEvent', { type: kind === 'down' ? 'mousePressed' : 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1, buttons: kind === 'down' ? 1 : 0 });
  await sleep(120);
}
await sleep(900);
console.log('菜单调用日志:', await H('JSON.stringify(window.__menuLog)'));
console.log('DOM 里是否有菜单:', await H(`(function(){ return document.body.children.length + ' 个子节点, 有固定定位的菜单=' + !![...document.body.children].find(el => el.style && el.style.position === 'fixed'); })()`));
console.log('CUR_INPUT 相关（若菜单没弹，多半是打开时没有输入上下文）:', await H('typeof window.__rhineMenuDebug'));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
