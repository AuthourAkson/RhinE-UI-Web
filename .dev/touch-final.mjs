// 最终验收：触摸"未选中的那盘磁带"，AR.hover 应变为 1 且 selAlbum 改变
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
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&sel=1' });
await sleep(22000);
await S('send("view","archive"); "ok"'); await sleep(4000);

const hits = JSON.parse(await S(`JSON.stringify((AR.hits||[]).map(h => { const q = h.quad; return { i: h.i, cx: (q[0][0]+q[2][0])/2, cy: (q[0][1]+q[2][1])/2 }; }))`));
console.log('命中区:', JSON.stringify(hits), ' 当前选中:', String(await S('AR.selAlbum')).slice(0, 34), ' 行内选中下标 r.sel =', await S('AR.rows.get(AR.group).sel'));

const pos = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]');
  const r = f.getBoundingClientRect(), w = f.contentWindow;
  const vw = w.eval('(function(){ try { return W; } catch(e){ return 1440; } })()');
  return JSON.stringify({ left: r.left, top: r.top, s: r.width / vw });
})()`));
const sel = await S('AR.rows.get(AR.group).sel');
// 必须选"未选中的那一盘"：AR.hits 里的 i 就是行内下标，i === r.sel 的那盘点下去是进入查阅模式
// 两盘磁带在货架上互相遮挡：hits.at() 返回**最上面**那盘。
// 所以用主题自己的 hits.at() 扫描出一个"只命中未选中那盘"的点，再触摸它。
const target = await S(`(function(){
  const want = ${sel} === 0 ? 1 : 0;
  const h = (AR.hits || []).find(x => x.i === want);
  if (!h) return null;
  const xs = h.quad.map(p => p[0]), ys = h.quad.map(p => p[1]);
  const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  for (let gy = 0; gy <= 24; gy++) for (let gx = 0; gx <= 24; gx++) {
    const x = x0 + (x1 - x0) * gx / 24, y = y0 + (y1 - y0) * gy / 24;
    try { const a = hits.at(x, y); if (a && (a.data === want || a.id === want)) return JSON.stringify({ x: x, y: y }); } catch (e) { }
  }
  return null;
})()`);
console.log('只属于未选中那盘的命中点（虚拟坐标）:', target);
if (!target || target === 'null') { console.log('没扫到独占点（两盘几乎完全重叠）'); }
else {
  const t = JSON.parse(target);
  const px = pos.left + t.x * pos.s, py = pos.top + t.y * pos.s;
  console.log(`触摸该点（虚拟 ${Math.round(t.x)},${Math.round(t.y)} → 页面 ${Math.round(px)},${Math.round(py)}）`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py, id: 1 }] });
  await sleep(120);
  console.log('  touchStart 后 AR.hover =', await S('AR.hover'));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(3200);
  const after = await S('AR.rows.get(AR.group).sel');
  console.log('  touchend 后 -> r.sel =', after, ' selAlbum =', String(await S('AR.selAlbum')).slice(0, 34));
  console.log('  结论:', after !== sel ? '**触摸点击成功改变了选中 ✓✓**' : '未改变 ✗');
}
await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
ws.close();
