// 最终一致性验证：清掉陈旧面板属性 → 所有面板应统一为中文 → 再用菜单切换一次验证仍然一致
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
const panels = ['header', 'stage', 'transport', 'manager', 'head', 'card'];
const langs = async () => {
  const out = {};
  for (const p of panels) {
    out[p] = await ev(`(function(){ const f = document.querySelector('iframe[data-id="${p}"]'); if (!f || !f.contentWindow) return '无'; try { return f.contentWindow.eval('(typeof UI_LANG !== "undefined" ? UI_LANG : "无") + "/" + (typeof tr === "function" ? tr("ARCHIVE") : "无")'); } catch (e) { return 'EXC'; } })()`);
  }
  return out;
};
const rows = () => ev(`(function(){
  const out = [];
  const walk = (box) => { for (const row of box.children) { if (row.style && row.style.position === 'fixed') { walk(row); continue; } const b = row.getBoundingClientRect(); if (b.width > 1) out.push({ t: (row.textContent||'').trim().slice(0,22), x: b.left + b.width/2, y: b.top + b.height/2 }); } };
  for (const box of [...document.body.children]) if (box.style && box.style.position === 'fixed') walk(box);
  return JSON.stringify(out);
})()`).then((s) => { try { return JSON.parse(s); } catch (e) { return []; } });
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(300); };
const glide = async (x1, y1, x2, y2, steps = 8) => { for (let i = 0; i <= steps; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps, button: 'none', buttons: 0 }); await sleep(45); } };
const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(60); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }); await sleep(400); };

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&consist=1")');
await sleep(6000);
// 清掉所有面板属性里的 uiLang（模拟用户没有历史残留的状态）
console.log('清理陈旧面板属性:', await ev(`(function(){ let n = 0; const del = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('uiLang') >= 0 && k.indexOf('rhine:prop:') === 0) { del.push(k); } } del.forEach(k => { localStorage.removeItem(k); n++; }); return '删除 ' + n + ' 个: ' + del.join(', '); })()`));
await send('Page.reload');
await sleep(15000);
console.log('\n=== 各面板语言（刷新后应全部一致）===');
console.log(JSON.stringify(await langs(), null, 1));

// 用菜单切到 English 再切回中文，验证切换后仍然一致
const hit = JSON.parse(await ev(`(function(){ const f = document.querySelector('iframe[data-id="header"]'); return f.contentWindow.eval('JSON.stringify((function(){ const a = hits.get("menu"); return { x: a.x, y: a.y, w: a.w, h: a.h }; })())'); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
const menuBtn = [fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2];
for (const target of ['English', '简体中文']) {
  await move(menuBtn[0] - 150, menuBtn[1]);
  await click(menuBtn[0], menuBtn[1]);
  await sleep(600);
  const l1 = await rows();
  const aa = l1.find((r) => /Audio Archive/.test(r.t));
  if (!aa) { console.log('没找到 Audio Archive 项:', l1.map((r) => r.t)); break; }
  await glide(menuBtn[0] - 40, menuBtn[1] + 60, aa.x, aa.y, 8);
  await sleep(500);
  const l2 = await rows();
  const lg = l2.find((r) => /Language|语言|言語/.test(r.t));
  await glide(aa.x, aa.y, lg.x, lg.y, 8);
  await sleep(500);
  const l3 = await rows();
  const item = l3.find((r) => r.t.includes(target));
  console.log(`\n切换到 ${target} …`, item ? '点击 (' + Math.round(item.x) + ',' + Math.round(item.y) + ')' : '没找到');
  if (!item) { console.log(JSON.stringify(l3.slice(-6))); break; }
  await click(item.x, item.y);
  await sleep(8000);
  console.log('  设置文件里的 uiLang:', await ev(`(function(){ try { const o = JSON.parse(localStorage.getItem('rhine:file:audio-archive-settings.json')||'{}'); return JSON.stringify(o.uiLang); } catch (e) { return 'ERR'; } })()`));
  console.log('  各面板:', JSON.stringify(await langs()));
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
