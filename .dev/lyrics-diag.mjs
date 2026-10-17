// 定位：translateLyrics 为什么提前 return —— 打印 trSettings() 与相关中间量
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 240000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200) : r.result.value; };
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?demo=1&diag=1' });
await sleep(4000);
await ev('localStorage.clear()');
await send('Page.reload');
await sleep(22000);
let ok = false;
for (let i = 0; i < 25; i++) { ok = (await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); return b && getComputedStyle(b).display==='block'; })()`)) === true; if (ok) break; await sleep(1000); }
if (ok) {
  const r = JSON.parse(await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.left+q.width/2,y:q.top+q.height/2}); })()`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none', buttons: 0 }); await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(9000);
}
await ev(`window.__RHINE_DEBUG__.playIndex(0)`);
await sleep(9000);
await S('send("view","lyrics"); "ok"');
await sleep(8000);

console.log(await S(`(function(){
  try {
    const out = {};
    out.SYSTEM_LANG = (typeof SYSTEM_LANG !== 'undefined') ? SYSTEM_LANG : '未定义';
    try { out.trSettings = trSettings(); } catch (e) { out.trSettings = 'EXC ' + e.message; }
    out.TR_state = (typeof TR !== 'undefined') ? TR.state : '无 TR';
    out.hasHandle = !!(typeof T !== 'undefined' && T.handle);
    out.lyrics = (typeof T !== 'undefined' && T.lyrics) ? { lines: T.lyrics.lines.length, source: T.lyrics.source, langs: T.lyrics.langs, synced: T.lyrics.synced } : null;
    // 手工跑一遍入口判断的每一步
    try {
      const L = T.lyrics, S2 = trSettings();
      out.steps = {
        targetOff: S2.target === 'off', noL: !L, langsGt1: L && L.langs > 1, noHandle: !T.handle,
        sameLang: (function(){ const texts = [...new Set(L.lines.map(l => l.a).filter(a => a && /\\S/.test(a)))]; const src = detectLang(texts); return { src: src, target: S2.target, same: sameLang(src, S2.target) }; })(),
        community: S2.community, targetZh: S2.target.startsWith('zh'), sourceIsNE: L.source === 'NETEASE',
      };
    } catch (e) { out.steps = 'EXC ' + e.message; }
    return JSON.stringify(out, null, 1);
  } catch (e) { return 'EXC ' + e.message; }
})()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
