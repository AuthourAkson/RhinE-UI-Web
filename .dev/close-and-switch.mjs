// 复现并验证两件事：① 点别处能关掉菜单 ② 切语言后不发生"黑屏/只换一半"
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160);
  return r.result.value;
};
const H = (code) => ev(`document.querySelector('iframe[data-id="header"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');
const panels = ['header', 'stage', 'transport', 'manager', 'head', 'card', 'fx'];
const langState = async () => {
  const out = {};
  for (const p of panels) out[p] = await ev(`(function(){ const f = document.querySelector('iframe[data-id="${p}"]'); if (!f || !f.contentWindow) return 'none'; try { return f.contentWindow.eval('(typeof UI_LANG !== "undefined" ? UI_LANG : "?") + " " + (typeof tr === "function" ? tr("ARCHIVE") : "?")'); } catch (e) { return 'EXC'; } })()`);
  return out;
};
const menuOpen = () => ev(`!![...document.body.children].find(el => el.style && el.style.position === 'fixed')`);
const rows = () => ev(`(function(){
  const out = [];
  const walk = (box) => { for (const row of box.children) { if (row.style && row.style.position === 'fixed') { walk(row); continue; } const b = row.getBoundingClientRect(); if (b.width > 1) out.push({ t: (row.textContent||'').trim().slice(0,22), x: b.left + b.width/2, y: b.top + b.height/2 }); } };
  for (const box of [...document.body.children]) if (box.style && box.style.position === 'fixed') walk(box);
  return JSON.stringify(out);
})()`).then((s) => { try { return JSON.parse(s); } catch (e) { return []; } });
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(280); };
const glide = async (x1, y1, x2, y2, steps = 8) => { for (let i = 0; i <= steps; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps, button: 'none', buttons: 0 }); await sleep(45); } };
const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(60); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }); await sleep(450); };

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&close=1")');
await sleep(9000);
// 起始统一为中文
await ev(`(function(){
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('uiLang') >= 0 && k.indexOf('rhine:prop:') === 0) localStorage.removeItem(k); }
  const key = 'rhine:file:audio-archive-settings.json';
  const o = JSON.parse(localStorage.getItem(key) || '{}'); o.uiLang = 'zh-CN'; localStorage.setItem(key, JSON.stringify(o, null, 1));
  return 'ok';
})()`);
await send('Page.reload');
await sleep(15000);
console.log('起始各面板:', JSON.stringify(await langState()));

const hit = JSON.parse(await ev(`(function(){ const f = document.querySelector('iframe[data-id="header"]'); return f.contentWindow.eval('JSON.stringify((function(){ const a = hits.get("menu"); return { x: a.x, y: a.y, w: a.w, h: a.h }; })())'); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
const btn = [fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2];

// ① 打开菜单 → 展开 Audio Archive → 点界面空白处 → 应关掉
console.log('\n=== ① 点别处关闭 ===');
await move(btn[0] - 150, btn[1]);
await click(btn[0], btn[1]);
await sleep(500);
let l1 = await rows();
const aa = l1.find((r) => /Audio Archive/.test(r.t));
await glide(btn[0] - 60, btn[1] + 60, aa.x, aa.y, 8);
await sleep(400);
console.log('  菜单已打开:', await menuOpen(), ' 子菜单项数:', (await rows()).length);
// 点击左侧档案视图区域（属于 stage 面板）与顶栏空白（header 面板）两处
const stageBox = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="stage"]').getBoundingClientRect(); return JSON.stringify({ x: r.left + 300, y: r.top + 200 }); })()`));
await click(stageBox.x, stageBox.y);
await sleep(500);
console.log('  点 stage 面板空白后，菜单还在吗:', await menuOpen());
await click(btn[0] - 250, btn[1]);      // 顶栏空白（header 面板内）
await sleep(500);
console.log('  点 header 空白后，菜单还在吗:', await menuOpen());

// ② 切到 English，观察是否黑屏 / 是否一致
console.log('\n=== ② 切到 English ===');
await move(btn[0] - 150, btn[1]);
await click(btn[0], btn[1]);
await sleep(500);
l1 = await rows();
const aa2 = l1.find((r) => /Audio Archive/.test(r.t));
await glide(btn[0] - 60, btn[1] + 60, aa2.x, aa2.y, 8);
await sleep(400);
const l2 = await rows();
const lg = l2.find((r) => /Language|语言|言語/.test(r.t));
await glide(aa2.x, aa2.y, lg.x, lg.y, 8);
await sleep(400);
const l3 = await rows();
const en = l3.find((r) => /English/.test(r.t));
console.log('  点击 English…');
await click(en.x, en.y);
for (const ms of [2000, 4000, 6000, 9000, 13000]) {
  await sleep(ms === 2000 ? 2000 : 2000);
  const st = await langState();
  const alive = Object.values(st).filter((v) => v === 'none' || v === 'EXC').length;
  console.log(`  +${ms}ms 面板异常数=${alive}`, JSON.stringify(st));
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\after-switch-en.png', Buffer.from(shot.data, 'base64'));
console.log('  设置文件:', await ev(`(function(){ try { const o = JSON.parse(localStorage.getItem('rhine:file:audio-archive-settings.json')||'{}'); return JSON.stringify(o.uiLang); } catch (e) { return 'ERR'; } })()`));
console.log('  已存 .dev/after-switch-en.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
