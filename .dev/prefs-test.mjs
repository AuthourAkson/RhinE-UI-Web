// 验证 PREFERENCES：点开 → 内容 → 清缓存 → Esc 关闭
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
const dlgText = () => ev(`(function(){ const el = document.querySelector('div[style*="2147483000"]'); return el ? el.innerText.replace(/\\n+/g, ' | ').slice(0, 700) : '（没有对话框）'; })()`);
const dlgOpen = () => ev(`!![...document.body.children].find(el => el.style && el.style.zIndex === '2147483000')`);
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(250); };
const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(60); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }); await sleep(500); };

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&prefs=1")');
await sleep(17000);
console.log('主题版本（清单里）:', await ev(`(function(){ return 'n/a'; })()`));

const hit = JSON.parse(await H(`(function(){ const a = hits.get('prefs'); return JSON.stringify(a ? { x: a.x, y: a.y, w: a.w, h: a.h } : null); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
console.log('PREFERENCES 命中区:', JSON.stringify(hit));
await move(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
await click(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
await sleep(900);
console.log('\n对话框已打开:', await dlgOpen());
console.log('内容:\n  ' + await dlgText());
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\preferences.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/preferences.png');

// 点「清空波形 / 封面缓存」
const btn = JSON.parse(await ev(`(function(){
  const el = document.querySelector('div[style*="2147483000"]'); if (!el) return 'null';
  const b = [...el.querySelectorAll('button')].find(x => x.textContent.includes('清空波形'));
  if (!b) return 'null';
  const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width/2, y: r.top + r.height/2, text: b.textContent });
})()`));
console.log('\n缓存按钮:', JSON.stringify(btn));
if (btn && btn.x) {
  await move(btn.x, btn.y); await click(btn.x, btn.y);
  await sleep(700);
  console.log('点击后对话框还在吗（应已关闭）:', await dlgOpen());
  console.log('宿主日志:', await ev(`(function(){ const p = document.getElementById('log') || document.querySelector('.log'); return p ? p.innerText.split('\\n').slice(-2).join(' | ') : '（找不到日志区）'; })()`));
}
// 再开一次，用 Esc 关闭
await click(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
await sleep(800);
console.log('\n再打开:', await dlgOpen());
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(600);
console.log('按 Esc 后:', await dlgOpen());
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
