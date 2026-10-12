// 验证：全新访客（无 localStorage）默认应为英文 —— 主题侧 UI_LANG、HUD 按钮、首选项都要是英文
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
const H = (code) => ev(`document.querySelector('iframe[data-id="header"]').contentWindow.eval(${JSON.stringify(code)})`);
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?langdefault=1' });
await sleep(12000);
// 确认是干净环境
console.log('localStorage 里的设置:', await ev(`(function(){ try { return String(localStorage.getItem('rhine:file:audio-archive-settings.json') || '（无，全新访客）'); } catch(e){ return 'ERR'; } })()`));
await sleep(14000);
console.log('主题 UI_LANG:', await H('(typeof UI_LANG !== "undefined" ? UI_LANG : "?")'));
console.log('主题读到的设置 uiLang:', await H(`(function(){ try { return String(getSetting('uiLang','（缺省）')); } catch(e){ return 'EXC'; } })()`));
console.log('HUD 按钮:', await ev(`(document.getElementById('pick-btn')||{}).textContent + ' / ' + (document.getElementById('hide-btn')||{}).textContent`));
console.log('档案页空态文案（应为英文）:', await S(`(function(){ try { return tr(LIB.live ? 'NO ALBUMS · THE MEDIA LIBRARY AND THE PLAYLISTS ARE EMPTY' : 'INDEXING LIBRARY …'); } catch(e){ return 'EXC'; } })()`));
// 打开首选项看语言
const hit = JSON.parse(await H(`(function(){ const a = hits.get('prefs'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
const mx = fr.x + hit.x + hit.w / 2, my = fr.y + hit.y + hit.h / 2;
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my, button: 'none', buttons: 0 }); await sleep(200);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1, buttons: 1 }); await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1, buttons: 0 }); await sleep(800);
console.log('首选项标题:', await ev(`(function(){ const el = document.getElementById('rhine-prefs'); return el ? el.innerText.split('\\n')[0] : '（没打开）'; })()`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\default-en.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/default-en.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
