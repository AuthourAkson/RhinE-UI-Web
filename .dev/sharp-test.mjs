// 文字清晰度：画布后备分辨率是否正确（含窗口尺寸变化后），并裁 PLAY ALBUM / OPEN ALBUM 放大看
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
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');
const canvases = () => ev(`(function(){
  const out = [];
  for (const f of document.querySelectorAll('iframe')) {
    let st = '?';
    try { const w = f.contentWindow, cv = w.document.querySelector('canvas');
      if (cv) { const dpr = w.devicePixelRatio || 1; const want = Math.round(cv.clientWidth * dpr) + 'x' + Math.round(cv.clientHeight * dpr);
        st = '后备 ' + cv.width + 'x' + cv.height + ' / 应 ' + want + (Math.abs(cv.width - cv.clientWidth * dpr) <= 1 && Math.abs(cv.height - cv.clientHeight * dpr) <= 1 ? ' ✓' : ' ✗不一致'); }
    } catch (e) { st = 'EXC'; }
    out.push(f.dataset.id + ': ' + st);
  }
  return out.join('\\n');
})()`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&sharp=1")');
await sleep(17000);
await S('send("view","archive"); "ok"');
await sleep(3000);
console.log('=== 初始（1707x899 @1.5）===');
console.log(await canvases());

console.log('\n=== 拉到全屏尺寸（2560x1380 @1.5 = 模拟全屏）===');
await send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1380, deviceScaleFactor: 1.5, mobile: false });
await sleep(5000);
console.log(await canvases());
console.log('dpr:', await ev('devicePixelRatio'), ' 视口:', await ev('innerWidth + "x" + innerHeight'));

// 裁「播放专辑 / 打开专辑」按钮放大 4 倍
const btns = JSON.parse(await S(`(function(){
  const h = hits.get('ar-play') || hits.get('play') || null;
  return JSON.stringify(h ? { x: h.x, y: h.y, w: h.w, h: h.h } : (hits ? Object.keys(hits.map || {}).slice(0,8) : []));
})()`)).catch && null;
const geo = await S(`(function(){
  const out = [];
  const a = hits.get('ar-play'), b = hits.get('ar-open');
  return JSON.stringify({ play: a ? { x: a.x, y: a.y, w: a.w, h: a.h } : null, open: b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null });
})()`);
console.log('\n按钮命中区:', geo);
const g = JSON.parse(geo);
const stage = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="stage"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
if (g.play) {
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: stage.x + g.play.x - 16, y: stage.y + g.play.y - 10, width: (g.open ? g.open.x + g.open.w : g.play.x + g.play.w) - g.play.x + 32, height: g.play.h + 20, scale: 4 } });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\buttons-zoom.png', Buffer.from(shot.data, 'base64'));
  console.log('已存 .dev/buttons-zoom.png（4 倍）');
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
