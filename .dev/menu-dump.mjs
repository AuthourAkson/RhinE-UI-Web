// dump 菜单 DOM 结构，定位子菜单为什么没出现
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
const dump = () => ev(`(function(){
  const d = document.querySelector('iframe[data-id="header"]').contentWindow.document;
  const out = [];
  out.push('body 子节点数=' + d.body.children.length);
  [...d.body.children].forEach((el, i) => {
    out.push('[' + i + '] <' + el.tagName + '> pos=' + (el.style.position || '-') + ' z=' + (el.style.zIndex || '-') + ' children=' + el.children.length + ' text="' + (el.textContent||'').trim().slice(0, 50) + '"');
    [...el.children].forEach((c, j) => {
      out.push('      (' + j + ') pos=' + (c.style.position || '-') + ' text="' + (c.textContent||'').trim().slice(0, 40) + '"');
      [...c.children].forEach((g, k) => out.push('            · ' + k + ' "' + (g.textContent||'').trim().slice(0, 30) + '"'));
    });
  });
  return out.join('\\n');
})()`);
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(250); };
const click = async (x, y) => {
  await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(600);
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&dbg2=1")');
await sleep(17000);
const hit = JSON.parse(await H(`(function(){ const a = hits.get('menu'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
await click(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
console.log('=== 打开 MENU 后 ===');
console.log(await dump());
const rows = JSON.parse(await H(`(function(){ const R = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); const d = document.querySelector('iframe[data-id="header"]').contentWindow.document; const box = [...d.body.children].find(el => el.style.position === 'fixed'); return JSON.stringify([...box.children].map(el => { const b = el.getBoundingClientRect(); return { t: (el.textContent||'').trim().slice(0,22), x: R.left + b.left + b.width/2, y: R.top + b.top + b.height/2 }; })); })()`));
const aa = rows.find((r) => /Audio Archive/.test(r.t));
console.log('\n=== 点 Audio Archive（' + aa.x + ',' + aa.y + '）后 ===');
await move(aa.x - 80, aa.y);
await click(aa.x, aa.y);
console.log(await dump());
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
