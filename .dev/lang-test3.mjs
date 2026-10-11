// 语言菜单完整流程（用"点击展开"这条更稳的路径）
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
const menuRows = () => ev(`(function(){
  const d = document.querySelector('iframe[data-id="header"]').contentWindow.document;
  const R = document.querySelector('iframe[data-id="header"]').getBoundingClientRect();
  const out = [];
  for (const box of d.querySelectorAll('body > div')) {
    if (!box.style || box.style.position !== 'fixed') continue;
    for (const row of box.children) { const b = row.getBoundingClientRect(); if (b.width) out.push({ t: (row.textContent||'').trim().slice(0,26), x: R.left + b.left + b.width/2, y: R.top + b.top + b.height/2 }); }
  }
  return JSON.stringify(out);
})()`);
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(200); };
const press = async (x, y) => {
  await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(550);
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&lang=3")');
await sleep(17000);
console.log('默认:', await H(`JSON.stringify({ UI_LANG: UI_LANG, 导航: [tr('ARCHIVE'), tr('PLAYLISTS'), tr('LYRICS'), tr('SIGNAL'), tr('STYLE')] })`));

const hit = JSON.parse(await H(`(function(){ const a = hits.get('menu'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
await press(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
let rows = JSON.parse(await menuRows());
console.log('顶层:', rows.map((r) => r.t).join(' | '));

const aa = rows.find((r) => /Audio Archive/.test(r.t));
await move(aa.x - 60, aa.y);           // 先移开，保证 mouseenter 会触发
await press(aa.x, aa.y);               // 点击展开子菜单
rows = JSON.parse(await menuRows());
console.log('Audio Archive 子菜单:', rows.map((r) => r.t).join(' | '));

const lang = rows.find((r) => /Language|语言|言語/.test(r.t));
console.log('语言行:', lang && lang.t);
await move(lang.x - 40, lang.y);
await press(lang.x, lang.y);
await sleep(500);
const shot1 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\menu-language.png', Buffer.from(shot1.data, 'base64'));
rows = JSON.parse(await menuRows());
const langs = rows.filter((r) => /English|简体中文|日本語/.test(r.t));
console.log('语言子菜单:', JSON.stringify(langs));

const en = langs.find((r) => /English/.test(r.t));
if (en) {
  console.log('\n切到 English 验证可逆…');
  await move(en.x - 30, en.y);
  await press(en.x, en.y);
  await sleep(7000);
  console.log('  设置:', await H('JSON.stringify(getSetting("uiLang","(无)"))'));
  console.log('  重载后:', await H(`JSON.stringify({ UI_LANG: UI_LANG, 导航: [tr('ARCHIVE'), tr('PLAYLISTS')], 菜单: tr('MENU') })`));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\lang-en.png', Buffer.from(shot2.data, 'base64'));
  // 再切回中文，方便用户直接看到中文
  console.log('\n再切回简体中文…');
  await press(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
  rows = JSON.parse(await menuRows());
  await press(rows.find((r) => /Audio Archive/.test(r.t)).x, rows.find((r) => /Audio Archive/.test(r.t)).y);
  rows = JSON.parse(await menuRows());
  const l2 = rows.find((r) => /Language|语言|言語/.test(r.t));
  await press(l2.x, l2.y);
  rows = JSON.parse(await menuRows());
  const zh = rows.find((r) => /简体中文/.test(r.t));
  console.log('  找到简体中文:', !!zh);
  if (zh) { await move(zh.x - 30, zh.y); await press(zh.x, zh.y); await sleep(7000); }
  console.log('  最终:', await H(`JSON.stringify({ UI_LANG: UI_LANG, 导航: [tr('ARCHIVE'), tr('PLAYLISTS'), tr('LYRICS'), tr('SIGNAL'), tr('STYLE')], 搜索: tr('SEARCH ARCHIVE'), 菜单: tr('MENU'), 偏好: tr('PREFERENCES') })`));
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\lang-zh.png', Buffer.from(shot3.data, 'base64'));
  console.log('已存 .dev/menu-language.png / lang-en.png / lang-zh.png');
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
