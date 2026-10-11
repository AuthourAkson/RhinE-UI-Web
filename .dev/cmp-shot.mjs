// 在与原版参考图完全相同的条件下截图：CSS 视口 1349×777 + DPR 1.5 → 2023×1166
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 40000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const fs = await import('node:fs');

// 原版参考图：2023×1166 设备像素 = 1349×777 CSS @ DPR 1.5
await send('Emulation.setDeviceMetricsOverride', { width: 1349, height: 777, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&cmp=1")');
await sleep(18000);
console.log('dpr =', await ev('window.devicePixelRatio'), ' CSS 视口 =', await ev('innerWidth + "x" + innerHeight'));

// 主题侧几何
const geom = await ev(`(function(){
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev2 = (e) => { try { return w.eval(e); } catch (err) { return 'ERR ' + err.message; } };
  return JSON.stringify({
    stage: ev2('W + "x" + H'), scale: ev2('SCALE'), dpr: ev2('DPR'),
    arZoom: ev2('+arZoom().toFixed(4)'), arK: ev2('+arK().toFixed(4)'),
    arrayW: ev2('arrayW()'), infoX: ev2('infoX()'), origin: ev2('JSON.stringify(origin())'),
    caseSprite: ev2('Math.round(CASE_META.array_res[0] * arK())'),
    slotPitch: ev2('JSON.stringify(CASE_META.axes.y.map(v => +(v*arK()).toFixed(1)))'),
    slotsInView: ev2('slotsInView()'), shelfSlots: ev2('slotCount(arRows()[0])'),
    albums: ev2('curGroup() ? curGroup().albums.length : -1'), shelfs: ev2('JSON.stringify(SHELVES.map(s => s.name + ":" + s.albums.length + "/" + s.slots))'),
    rows: ev2('JSON.stringify([...AR.rows].map(([gi,r]) => ({gi, sel:r.sel, pos:+r.pos.x.toFixed(2), scroll:+r.scroll.x.toFixed(2)})))'),
  }, null, 1);
})()`);
console.log('主题几何:', geom);

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\cmp-1album-1349.png', Buffer.from(shot.data, 'base64'));
console.log('截图已存: .dev/cmp-1album-1349.png（应与原版参考同为 2023x1166）');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
