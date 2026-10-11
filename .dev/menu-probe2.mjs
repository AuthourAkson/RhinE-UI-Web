// 直接从 DOM 查每一层菜单的条目，定位子菜单为空的环节
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
const info = () => H(`(function(){
  const d = document;
  const boxes = [...d.body.children].filter(el => el.style && el.style.position === 'fixed');
  return JSON.stringify(boxes.map((b, i) => ({
    层: i, left: b.style.left, top: b.style.top,
    条目数: b.__popup ? b.__popup.__items.length : '无 popup',
    条目: b.__popup ? b.__popup.__items.slice(0, 12).map(x => x.k + ':' + (x.text || '').slice(0, 16)) : [],
  })), null, 1);
})()`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&dbg3=1")');
await sleep(17000);

// 直接在面板里模拟主题的调用序列（不经过鼠标），验证 popup 的父子关系是否正确
console.log('=== 直接构造：root › theme(submenu) 的条目数 ===');
console.log(await H(`(function(){
  const root = window.CreatePopupMenu(), theme = window.CreatePopupMenu();
  theme.AppendMenuItem(0, 11, '检查更新');
  theme.AppendMenuItem(0x8, 13, '每天检查更新');
  const lm = window.CreatePopupMenu();
  UI_LANGS.forEach(([, name], i) => lm.AppendMenuItem(0, 450 + i, name));
  lm.CheckMenuRadioItem(450, 452, 450);
  lm.AppendTo(theme, 0, 'Language · 语言 · 言語');
  theme.AppendTo(root, 0, 'Audio Archive');
  return JSON.stringify({
    root条目: root.__items.map(i => i.k + ':' + i.text),
    root里子菜单的条目数: root.__items[0].menu.__items.length,
    theme条目: theme.__items.map(i => i.k + ':' + i.text),
    语言子菜单条目: lm.__items.map(i => i.k + ':' + i.text + (i.checked ? '(选中)' : '')),
  });
})()`));

const hit = JSON.parse(await H(`(function(){ const a = hits.get('menu'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(250); };
await move(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fr.x + hit.x + hit.w / 2, y: fr.y + hit.y + hit.h / 2, button: 'left', clickCount: 1, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fr.x + hit.x + hit.w / 2, y: fr.y + hit.y + hit.h / 2, button: 'left', clickCount: 1, buttons: 0 });
await sleep(800);
console.log('\n=== 真实打开 MENU 后各层 ===');
console.log(await info());
const rows = JSON.parse(await H(`(function(){ const R = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); const b = [...document.body.children].find(el => el.style.position === 'fixed'); return JSON.stringify([...b.children].filter(el => el.__popup).map(el => { const r = el.getBoundingClientRect(); return { t: (el.textContent||'').trim().slice(0,20), x: R.left + r.left + r.width/2, y: R.top + r.top + r.height/2 }; })); })()`));
const aa = rows.find((r) => /Audio Archive/.test(r.t));
console.log('\n悬停 Audio Archive 行 (', aa.x, aa.y, ')');
await move(aa.x, aa.y);
await sleep(800);
console.log(await info());
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
