// 语言菜单完整流程：默认中文 → MENU → Audio Archive › Language › 简体中文
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
const fs = await import('node:fs');
// 读 header 面板里所有菜单 DOM 的行（含子菜单），返回页面坐标
const menuRows = () => ev(`(function(){
  const w = document.querySelector('iframe[data-id="header"]').contentWindow, d = w.document;
  const R = document.querySelector('iframe[data-id="header"]').getBoundingClientRect();
  const out = [];
  for (const el of d.querySelectorAll('div')) {
    if (!el.style || el.style.position !== 'fixed') continue;
    for (const row of el.children) { const b = row.getBoundingClientRect(); if (b.width) out.push({ t: (row.textContent||'').trim().slice(0,26), x: R.left + b.left + b.width/2, y: R.top + b.top + b.height/2 }); }
  }
  return JSON.stringify(out);
})()`);
const click = async (x, y, kind) => {
  if (!kind || kind === 'move') { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(250); }
  if (!kind || kind === 'down') { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(40); }
  if (!kind || kind === 'up') { await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }); await sleep(450); }
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&lang=2")');
await sleep(17000);

console.log('=== ① 默认语言 ===');
console.log(await H(`JSON.stringify({ SYSTEM_LANG: systemLang(), UI_LANG: UI_LANG, 中文表: !!I18N['zh-CN'], 导航: [tr('ARCHIVE'), tr('PLAYLISTS'), tr('LYRICS'), tr('SIGNAL'), tr('STYLE')], 菜单: tr('MENU') })`));
const shot0 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\lang-default.png', Buffer.from(shot0.data, 'base64'));

console.log('\n=== ② 打开 MENU ===');
const hit = JSON.parse(await H(`(function(){ const a = hits.get('menu'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
await click(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2, 'down');
await click(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2, 'up');
console.log('顶层项:', await menuRows());

// 悬停 "Audio Archive" 展开 → 再悬停 "Language · 语言 · 言語" 展开
let rows = JSON.parse(await menuRows());
const aa = rows.find((r) => /Audio Archive/.test(r.t));
console.log('悬停 Audio Archive:', aa && aa.t);
await click(aa.x, aa.y, 'move');
await sleep(600);
rows = JSON.parse(await menuRows());
const lang = rows.find((r) => /Language|语言|言語/.test(r.t));
console.log('看到语言行:', lang && lang.t);
await click(lang.x, lang.y, 'move');
await sleep(600);
const shot1 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\menu-language.png', Buffer.from(shot1.data, 'base64'));
rows = JSON.parse(await menuRows());
console.log('语言子菜单:', JSON.stringify(rows.filter((r) => /English|简体中文|日本語/.test(r.t))));

const zh = rows.find((r) => /简体中文/.test(r.t));
if (zh) {
  console.log('\n=== ③ 点「简体中文」===');
  await click(zh.x, zh.y, 'down');
  await click(zh.x, zh.y, 'up');
  await sleep(7000);      // 所有面板 reload
  console.log('设置:', await H('JSON.stringify(getSetting("uiLang", "(无)"))'));
  console.log('重载后:', await H(`JSON.stringify({ UI_LANG: UI_LANG, 导航: [tr('ARCHIVE'), tr('PLAYLISTS'), tr('LYRICS'), tr('SIGNAL'), tr('STYLE')], 搜索: tr('SEARCH ARCHIVE'), 菜单: tr('MENU') })`));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\lang-zh.png', Buffer.from(shot2.data, 'base64'));
  console.log('已存 .dev/lang-zh.png');
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
