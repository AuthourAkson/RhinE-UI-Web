// 验证宿主文案跟随界面语言：英文 / 中文各开一次首选项
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
const fs = await import('node:fs');
const dlg = () => ev(`(function(){ const el = [...document.body.children].find(e => e.style && e.style.zIndex === '2147483000'); return el ? el.innerText.replace(/\\n+/g, ' | ').slice(0, 420) : '（无）'; })()`);
const hud = () => ev(`(function(){ const p = document.getElementById('pick-btn'), h = document.getElementById('hide-btn'); return (p ? p.textContent : '?') + ' / ' + (h ? h.textContent : '?'); })()`);
const statusLine = () => ev(`(function(){ const l = document.getElementById('log'); return l ? l.textContent : '?'; })()`);
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(220); };
const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(60); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }); await sleep(500); };

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&hl=1")');
await sleep(9000);

for (const lang of ['en', 'zh-CN']) {
  await ev(`(function(){ const k='rhine:file:audio-archive-settings.json'; const o=JSON.parse(localStorage.getItem(k)||'{}'); o.uiLang=${JSON.stringify(lang)}; localStorage.setItem(k, JSON.stringify(o,null,1)); for (let i=0;i<localStorage.length;i++){ const key=localStorage.key(i); if (key.indexOf('rhine:prop:')===0 && key.endsWith(':uiLang')) localStorage.removeItem(key); } return 'ok'; })()`);
  await send('Page.reload');
  await sleep(15000);
  const hit = JSON.parse(await H(`(function(){ const a = hits.get('prefs'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
  const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
  await move(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
  await click(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
  await sleep(800);
  console.log(`\n=== 语言 ${lang} ===`);
  console.log('  主题侧 UI_LANG:', await H('UI_LANG'), ' | HUD 按钮:', await hud());
  console.log('  状态行:', await statusLine());
  console.log('  首选项:', await dlg());
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`D:\\AgentTestLab\\RhinE-UI\\.dev\\prefs-${lang === 'en' ? 'en' : 'zh'}.png`, Buffer.from(shot.data, 'base64'));
  // 关掉
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(400);
}
// 恢复中文，方便用户
await ev(`(function(){ const k='rhine:file:audio-archive-settings.json'; const o=JSON.parse(localStorage.getItem(k)||'{}'); o.uiLang='zh-CN'; localStorage.setItem(k, JSON.stringify(o,null,1)); return 'ok'; })()`);
console.log('\n已存 .dev/prefs-en.png / prefs-zh.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
