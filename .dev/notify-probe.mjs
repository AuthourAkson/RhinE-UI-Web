// 切语言后：其它面板是否收到 ui-lang、是否重载
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
const P = (p, code) => ev(`(function(){ const f = document.querySelector('iframe[data-id="${p}"]'); if (!f || !f.contentWindow) return 'none'; try { return f.contentWindow.eval(${JSON.stringify(code)}); } catch (e) { return 'EXC ' + e.message; } })()`);
const rows = () => ev(`(function(){
  const out = [];
  const walk = (box) => { for (const row of box.children) { if (row.style && row.style.position === 'fixed') { walk(row); continue; } const b = row.getBoundingClientRect(); if (b.width > 1) out.push({ t: (row.textContent||'').trim().slice(0,22), x: b.left + b.width/2, y: b.top + b.height/2 }); } };
  for (const box of [...document.body.children]) if (box.style && box.style.position === 'fixed') walk(box);
  return JSON.stringify(out);
})()`).then((s) => { try { return JSON.parse(s); } catch (e) { return []; } });
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(260); };
const glide = async (x1, y1, x2, y2, steps = 8) => { for (let i = 0; i <= steps; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps, button: 'none', buttons: 0 }); await sleep(45); } };
const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(60); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }); await sleep(450); };

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&notify=1")');
await sleep(9000);
await ev(`(function(){ for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('uiLang') >= 0 && k.indexOf('rhine:prop:') === 0) localStorage.removeItem(k); }
  const key='rhine:file:audio-archive-settings.json'; const o=JSON.parse(localStorage.getItem(key)||'{}'); o.uiLang='zh-CN'; localStorage.setItem(key, JSON.stringify(o,null,1)); return 'ok'; })()`);
await send('Page.reload');
await sleep(15000);

// 在 stage 面板里挂个探针：记录是否收到 ui-lang / on_notify_data
console.log('挂探针:', await P('stage', `(function(){
  window.__probe = { notify: 0, uiLangMsgs: 0, reloadCalled: 0, bootAt: performance.timeOrigin };
  const on = window.on_notify_data;
  window.on_notify_data = function(name, info){ window.__probe.notify++; try { const m = JSON.parse(info); if (m && m.type === 'ui-lang') window.__probe.uiLangMsgs++; } catch(e){} return on ? on.apply(this, arguments) : undefined; };
  const rl = window.Reload;
  window.Reload = function(){ window.__probe.reloadCalled++; return rl.apply(this, arguments); };
  return JSON.stringify(window.__probe);
})()`));
console.log('stage 的 ui-lang 处理器数量:', await P('stage', 'JSON.stringify(Object.keys(BUS_HANDLERS || {}))'));

const hit = JSON.parse(await ev(`(function(){ const f = document.querySelector('iframe[data-id="header"]'); return f.contentWindow.eval('JSON.stringify((function(){ const a = hits.get("menu"); return { x: a.x, y: a.y, w: a.w, h: a.h }; })())'); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
const btn = [fr.x + hit.x + hit.w / 2, fr.y + hit.y + hit.h / 2];
await move(btn[0] - 150, btn[1]);
await click(btn[0], btn[1]);
await sleep(500);
let l1 = await rows();
const aa = l1.find((r) => /Audio Archive/.test(r.t));
await glide(btn[0] - 60, btn[1] + 60, aa.x, aa.y, 8);
await sleep(400);
const l2 = await rows();
const lg = l2.find((r) => /Language|语言|言語/.test(r.t));
await glide(aa.x, aa.y, lg.x, lg.y, 8);
await sleep(400);
const l3 = await rows();
const en = l3.find((r) => /English/.test(r.t));
console.log('\n点击 English…');
await click(en.x, en.y);
await sleep(10000);
console.log('stage 探针:', await P('stage', 'JSON.stringify(window.__probe || null)'));
console.log('stage 的 getSetting/UI_LANG:', await P('stage', 'JSON.stringify({ 设置: getSetting("uiLang","(无)"), UI_LANG: typeof UI_LANG !== "undefined" ? UI_LANG : "?" })'));
console.log('header 的 getSetting/UI_LANG:', await P('header', 'JSON.stringify({ 设置: getSetting("uiLang","(无)"), UI_LANG: typeof UI_LANG !== "undefined" ? UI_LANG : "?" })'));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
