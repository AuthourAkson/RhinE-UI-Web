// 最终验证：悬停 MENU → Audio Archive → Language → 点简体中文
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
const rows = () => ev(`(function(){
  const out = [];
  const walk = (box) => { for (const row of box.children) { if (row.style && row.style.position === 'fixed') { walk(row); continue; } const b = row.getBoundingClientRect(); if (b.width > 1) out.push({ t: (row.textContent||'').trim().slice(0,24), x: b.left + b.width/2, y: b.top + b.height/2 }); } };
  for (const box of [...document.body.children]) if (box.style && box.style.position === 'fixed') walk(box);
  return JSON.stringify(out);
})()`).then((s) => { try { return JSON.parse(s); } catch (e) { return []; } });
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(320); };
const clickOnly = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(400);
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&fin=1")');
await sleep(17000);
console.log('当前语言:', await H('JSON.stringify({ UI_LANG: UI_LANG, 导航: tr("ARCHIVE") + " / " + tr("PLAYLISTS") })'));

const hit = JSON.parse(await H(`(function(){ const a = hits.get('menu'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
await move(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
await clickOnly(fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2);
await sleep(600);
const l1 = await rows();
console.log('① 顶层:', l1.map((r) => r.t).join(' | '));

const aa = l1.find((r) => /Audio Archive/.test(r.t));
await move(aa.x, aa.y);
await sleep(800);
const l2 = await rows();
console.log('② 第二层（末尾 6 项）:', l2.slice(-6).map((r) => r.t).join(' | '));

const lang = l2.find((r) => /Language|语言|言語/.test(r.t));
await move(lang.x, lang.y);
await sleep(800);
const l3 = await rows();
const langs = l3.filter((r) => /English|简体中文|日本語/.test(r.t));
console.log('③ 语言子菜单:', JSON.stringify(langs));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\menu-language.png', Buffer.from(shot.data, 'base64'));

// 先切到 English，再切回中文，验证双向都行
for (const want of ['English', '简体中文']) {
  const item = langs.find((r) => r.t.includes(want));
  if (!item) continue;
  console.log(`④ 点击「${want}」…`);
  await clickOnly(item.x, item.y);
  await sleep(7000);
  console.log('   设置:', await H('JSON.stringify(getSetting("uiLang", "(无)"))'), ' UI_LANG:', await H('UI_LANG'), ' 导航:', await H('tr("ARCHIVE")'));
  if (want === '简体中文') {
    const s2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\lang-zh.png', Buffer.from(s2.data, 'base64'));
  }
  // 重新打开菜单准备下一次切换
  const hit2 = JSON.parse(await H(`(function(){ const a = hits.get('menu'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
  await move(fr.x + hit2.x + hit2.w / 2, fr.y + hit2.y + hit2.h / 2);
  await clickOnly(fr.x + hit2.x + hit2.w / 2, fr.y + hit2.y + hit2.h / 2);
  await sleep(600);
  const r1 = await rows();
  const aa2 = r1.find((r) => /Audio Archive/.test(r.t));
  await move(aa2.x, aa2.y); await sleep(700);
  const r2 = await rows();
  const lg2 = r2.find((r) => /Language|语言|言語/.test(r.t));
  await move(lg2.x, lg2.y); await sleep(700);
  langs.length = 0;
  for (const r of await rows()) if (/English|简体中文|日本語/.test(r.t)) langs.push(r);
}
console.log('已存 .dev/menu-language.png / lang-zh.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
