// 最终：切语言 → 整页重载 → 应保持一致；再切回中文 → 再重载 → 仍一致
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
const fs = await import('node:fs');
const panels = ['header', 'stage', 'transport', 'manager', 'head', 'card', 'fx'];
const langState = async () => {
  const out = [];
  for (const p of panels) out.push(await ev(`(function(){ const f = document.querySelector('iframe[data-id="${p}"]'); if (!f || !f.contentWindow) return '${p}:none'; try { return '${p}:' + f.contentWindow.eval('UI_LANG'); } catch (e) { return '${p}:EXC'; } })()`));
  return out.join(' ');
};
const rows = () => ev(`(function(){
  const out = [];
  const walk = (box) => { for (const row of box.children) { if (row.style && row.style.position === 'fixed') { walk(row); continue; } const b = row.getBoundingClientRect(); if (b.width > 1) out.push({ t: (row.textContent||'').trim().slice(0,22), x: b.left + b.width/2, y: b.top + b.height/2 }); } };
  for (const box of [...document.body.children]) if (box.style && box.style.position === 'fixed') walk(box);
  return JSON.stringify(out);
})()`).then((s) => { try { return JSON.parse(s); } catch (e) { return []; } });
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(260); };
const glide = async (x1, y1, x2, y2, steps = 8) => { for (let i = 0; i <= steps; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps, button: 'none', buttons: 0 }); await sleep(45); } };
const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(60); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }); await sleep(450); };

const switchTo = async (target) => {
  const hit = JSON.parse(await ev(`(function(){ const f = document.querySelector('iframe[data-id="header"]'); return f.contentWindow.eval('JSON.stringify((function(){ const a = hits.get("menu"); return { x: a.x, y: a.y, w: a.w, h: a.h }; })())'); })()`));
  const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
  const btn = [fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2];
  await move(btn[0] - 150, btn[1]);
  await click(btn[0], btn[1]);
  await sleep(500);
  const l1 = await rows();
  const aa = l1.find((r) => /Audio Archive/.test(r.t));
  await glide(btn[0] - 60, btn[1] + 60, aa.x, aa.y, 8);
  await sleep(400);
  const l2 = await rows();
  const lg = l2.find((r) => /Language|语言|言語/.test(r.t));
  await glide(aa.x, aa.y, lg.x, lg.y, 8);
  await sleep(400);
  const l3 = await rows();
  const item = l3.find((r) => r.t.includes(target));
  if (!item) { console.log('  找不到', target, JSON.stringify(l3.slice(-4))); return false; }
  await click(item.x, item.y);
  await sleep(9000);
  return true;
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&persist=1")');
await sleep(9000);
await ev(`(function(){ for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('uiLang') >= 0 && k.indexOf('rhine:prop:') === 0) localStorage.removeItem(k); }
  const key='rhine:file:audio-archive-settings.json'; const o=JSON.parse(localStorage.getItem(key)||'{}'); o.uiLang='zh-CN'; localStorage.setItem(key, JSON.stringify(o,null,1)); return 'ok'; })()`);
await send('Page.reload');
await sleep(15000);
console.log('起始:', await langState());

console.log('\n切到 English…');
await switchTo('English');
console.log('  切换后:', await langState());
console.log('  整页重载后:');
await send('Page.reload');
await sleep(15000);
console.log('   ', await langState());
const shotEn = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\en-consistent.png', Buffer.from(shotEn.data, 'base64'));

console.log('\n切回 简体中文…');
await switchTo('简体中文');
console.log('  切换后:', await langState());
console.log('  整页重载后:');
await send('Page.reload');
await sleep(15000);
console.log('   ', await langState());
const shotZh = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\zh-consistent.png', Buffer.from(shotZh.data, 'base64'));
console.log('已存 .dev/en-consistent.png / zh-consistent.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
