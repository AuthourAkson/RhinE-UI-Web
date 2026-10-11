// 完整流程：MENU → Audio Archive → Language · 语言 · 言語 → 简体中文
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
// 菜单现在画在**顶层页面**里（面板 iframe 会裁掉它），递归读出每一层的行
const rows = () => ev(`(function(){
  const out = [];
  const walk = (box) => {
    for (const row of box.children) {
      if (row.style && row.style.position === 'fixed') { walk(row); continue; }   // 子菜单容器，继续往下
      const b = row.getBoundingClientRect();
      if (b.width > 1 && b.height > 1) out.push({ t: (row.textContent || '').trim().slice(0, 26), x: b.left + b.width / 2, y: b.top + b.height / 2 });
    }
  };
  for (const box of [...document.body.children]) if (box.style && box.style.position === 'fixed') walk(box);
  return JSON.stringify(out);
})()`).then((s) => { try { return JSON.parse(s); } catch (e) { return []; } });
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(300); };
const press = async (x, y) => {
  await move(x - 40, y); await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(650);
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&flow=1")');
await sleep(17000);
console.log('起点:', await H(`JSON.stringify({ UI_LANG: UI_LANG, 导航: [tr('ARCHIVE'), tr('PLAYLISTS'), tr('LYRICS'), tr('SIGNAL'), tr('STYLE')], 菜单: tr('MENU') })`));

// ① 打开 MENU（先把语言切成 English，才能验证"中文可选"）
await H(`setSetting('uiLang', 'en'); 'ok'`);
await send('Page.reload');
await sleep(16000);
console.log('切成英文后:', await H(`JSON.stringify({ UI_LANG: UI_LANG, 导航: [tr('ARCHIVE'), tr('PLAYLISTS'), tr('LYRICS'), tr('SIGNAL'), tr('STYLE')] })`));
const hit = JSON.parse(await H(`(function(){ const a = hits.get('menu'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
await press(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
let list1 = await rows();
console.log('① 顶层:', list1.map((r) => r.t).join(' | '));

// ② Audio Archive › Language（悬停 + 点击都用上，确保展开）
const aa = list1.find((r) => /Audio Archive/.test(r.t));
await move(aa.x - 120, aa.y);
await move(aa.x, aa.y);
await sleep(700);
let list2 = await rows();
if (list2.length <= list1.length) { await press(aa.x, aa.y); list2 = await rows(); }   // 悬停没展开就点一下
console.log('② Audio Archive 展开:', list2.map((r) => r.t).join(' | '));
const lang = list2.find((r) => /Language|语言|言語/.test(r.t));
if (!lang) { console.log('✗ 没找到语言行'); ws.close(); process.exit(1); }
await move(lang.x - 100, lang.y);
await move(lang.x, lang.y);
await sleep(700);
let list3 = await rows();
if (!list3.some((r) => /English|简体中文|日本語/.test(r.t))) { await press(lang.x, lang.y); list3 = await rows(); }
const langs = list3.filter((r) => /English|简体中文|日本語/.test(r.t));
console.log('③ 语言子菜单:', JSON.stringify(langs));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\menu-language.png', Buffer.from(shot.data, 'base64'));
const zh = langs.find((r) => /简体中文/.test(r.t));
if (zh) {
  await press(zh.x, zh.y);
  await sleep(7000);
  console.log('④ 点「简体中文」→ 设置:', await H('JSON.stringify(getSetting("uiLang","(无)"))'));
  console.log('   重载后:', await H(`JSON.stringify({ UI_LANG: UI_LANG, 导航: [tr('ARCHIVE'), tr('PLAYLISTS'), tr('LYRICS'), tr('SIGNAL'), tr('STYLE')], 搜索: tr('SEARCH ARCHIVE'), 菜单: tr('MENU'), 偏好: tr('PREFERENCES') })`));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\lang-zh.png', Buffer.from(shot2.data, 'base64'));
  console.log('   已存 .dev/menu-language.png / lang-zh.png');
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
