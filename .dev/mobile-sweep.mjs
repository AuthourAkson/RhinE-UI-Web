// 量化"主题内部排版在窄视口下的溢出/重叠"：dump header/transport 的命中区矩形
// 命中区由主题自己的 layout() 算出，和实际画面同源 —— 溢出/重叠可以直接量。
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const fs = await import('node:fs');

// 某面板里所有命中区的 {id,x,y,w,h}（取主题自己的 hits 表）
const HITS = (pid) => ev(`(function(){
  const f = document.querySelector('iframe[data-id="${pid}"]');
  if (!f) return '[]';
  try {
    const w = f.contentWindow;
    const out = [];
    for (const h of w.eval('(function(){ try { return JSON.stringify([...hits.values()].map(v => Array.isArray(v) ? v : [v]).flat()); } catch(e){ return "[]"; } })()') ? JSON.parse(w.eval('(function(){ try { return JSON.stringify([...hits.values()].map(v => Array.isArray(v) ? v : [v]).flat()); } catch(e){ return "[]"; } })()')) : []) {
      if (h && h.x != null) out.push({ id: h.id, x: Math.round(h.x), y: Math.round(h.y), w: Math.round(h.w), h: Math.round(h.h) });
    }
    return JSON.stringify(out);
  } catch (e) { return 'EXC ' + e.message; }
})()`);

await send('Page.enable');
for (const [w, h, dpr, label, shot] of [[390, 844, 3, '竖屏 390', false], [430, 932, 3, '竖屏 430', false], [844, 390, 3, '横屏 844', true], [768, 1024, 2, '平板 768', false], [1024, 768, 2, '横屏平板 1024', false]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&w=' + w });
  await sleep(20000);
  const geo = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('iframe')].filter(f => f.getBoundingClientRect().width > 0).map(f => f.dataset.id + ':' + Math.round(f.getBoundingClientRect().width) + 'x' + Math.round(f.getBoundingClientRect().height)))`));
  const hits = JSON.parse(await HITS('header'));
  const over = hits.filter((r) => r.x + r.w > w + 1 || r.x < -1);
  // 两两重叠检测
  let clash = 0;
  for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
    const a = hits[i], b = hits[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) clash++;
  }
  console.log(`\n【${label}】面板: ${geo.join('  ')}`);
  console.log(`  header 命中区 ${hits.length} 个 → 溢出屏外 ${over.length} 个${over.length ? '  ✗ ' + over.map((r) => r.id).join(',') : ' ✓'}   互相重叠 ${clash} 对${clash ? ' ✗' : ' ✓'}`);
  console.log(`  各命中区: ${hits.map((r) => r.id + '(' + r.x + '~' + (r.x + r.w) + ')').join(' ')}`);
  if (shot) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\mobile-landscape.png', Buffer.from(s.data, 'base64'));
    console.log('  已存 .dev/mobile-landscape.png');
  }
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
