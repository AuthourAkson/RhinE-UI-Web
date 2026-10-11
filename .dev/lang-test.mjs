// 验证：① 语言表进了脚本顺序 ② 默认语言跟随系统（中文）③ MENU 能弹出、点选后真的切换
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
const Hdoc = (code) => ev(`(function(){ const d = document.querySelector('iframe[data-id="header"]').contentWindow.document; ${code} })()`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
// 先清掉可能残留的 uiLang 设置，验证"默认跟随系统"
await ev('location.assign("http://127.0.0.1:8300/?demo=1&lang=1")');
await sleep(17000);

console.log('=== ① 默认语言（未设置 uiLang 时应跟随系统 → zh-CN）===');
console.log(await H(`JSON.stringify({
  navigator语言: navigator.language,
  SYSTEM_LANG: typeof SYSTEM_LANG !== 'undefined' ? SYSTEM_LANG : '?',
  UI_LANG: typeof UI_LANG !== 'undefined' ? UI_LANG : '?',
  中文表已加载: typeof I18N !== 'undefined' && !!I18N['zh-CN'],
  抽样翻译: { ARCHIVE: tr('ARCHIVE'), PREVIOUS: tr('PREVIOUS'), MENU: tr('MENU'), SETTINGS: tr('SETTINGS') },
})`));
console.log('  header 里的实际文字:', await H(`JSON.stringify({ 导航: [tr('ARCHIVE'), tr('PLAYLISTS'), tr('LYRICS'), tr('SIGNAL'), tr('STYLE')], 搜索: tr('SEARCH ARCHIVE'), 偏好: tr('PREFERENCES'), 菜单: tr('MENU') })`));
console.log('  uiLang 设置:', await H('JSON.stringify(getSetting("uiLang", "(未设置)"))'));

console.log('\n=== ② MENU 命中区 ===');
const hit = JSON.parse(await H(`(function(){ const a = hits.get('menu'); return JSON.stringify(a ? { x: a.x, y: a.y, w: a.w, h: a.h } : null); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
console.log('menu 命中区:', JSON.stringify(hit));
const mx = fr.x + hit.x + hit.w / 2, my = fr.y + hit.y + hit.h / 2;
const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(500);
};
await click(mx, my);
await sleep(800);
const menuDom = await Hdoc(`const box = [...document.body.children].find(el => el.style && el.style.zIndex === '2147483000'); if (!box) return '（没有菜单 DOM）'; return [...box.children].map(el => (el.textContent || '').trim()).join(' | ');`);
console.log('菜单内容:', menuDom);
await send('Page.captureScreenshot', { format: 'png' }).then((s) => fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\menu-open.png', Buffer.from(s.data, 'base64')));
console.log('已存 .dev/menu-open.png');

// ③ 在菜单里点"简体中文"：先点 Language 行展开子菜单，再点子项
const rows = JSON.parse(await Hdoc(`const box = [...document.body.children].find(el => el.style && el.style.zIndex === '2147483000'); if (!box) return '[]';
  const R = document.querySelector('iframe[data-id="header"]').getBoundingClientRect();
  return JSON.stringify([...box.children].map(el => { const b = el.getBoundingClientRect(); return { t: (el.textContent||'').trim().slice(0, 28), x: R.left + b.left + b.width/2, y: R.top + b.top + b.height/2 }; }));`));
const langRow = rows.find((r) => /Language|语言|言語/i.test(r.t));
console.log('\n=== ③ 点语言行 ===', JSON.stringify(langRow));
if (langRow) {
  await click(langRow.x, langRow.y);
  await sleep(700);
  const sub = JSON.parse(await Hdoc(`const R = document.querySelector('iframe[data-id="header"]').getBoundingClientRect();
    const boxes = [...document.body.children].filter(el => el.style && el.style.zIndex === '2147483000');
    const out = [];
    for (const box of boxes) for (const el of box.children) { const b = el.getBoundingClientRect(); if (b.width) out.push({ t: (el.textContent||'').trim().slice(0,20), x: R.left + b.left + b.width/2, y: R.top + b.top + b.height/2 }); }
    return JSON.stringify(out);`));
  console.log('子菜单项:', JSON.stringify(sub));
  await send('Page.captureScreenshot', { format: 'png' }).then((s) => fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\menu-lang.png', Buffer.from(s.data, 'base64')));
  const zh = sub.find((r) => /简体中文/.test(r.t));
  if (zh) {
    console.log('点击「简体中文」…');
    await click(zh.x, zh.y);
    await sleep(6000);      // 面板会 reload
    console.log('设置已写入:', await ev(`(function(){ try { return localStorage.getItem('rhine:file:audio-archive-settings.json') ? '有设置文件' : '(无)'; } catch (e) { return 'ERR'; } })()`));
    console.log('重载后 UI_LANG:', await H('typeof UI_LANG !== "undefined" ? UI_LANG : "?"'));
    console.log('重载后抽样:', await H(`JSON.stringify({ 导航: tr('ARCHIVE') + ' / ' + tr('PLAYLISTS') + ' / ' + tr('LYRICS'), 菜单: tr('MENU'), 偏好: tr('PREFERENCES') })`));
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\lang-zh.png', Buffer.from(shot2.data, 'base64'));
    console.log('已存 .dev/lang-zh.png');
  }
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
