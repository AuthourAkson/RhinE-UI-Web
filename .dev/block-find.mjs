// 只找"中间灰"（亮度 35~95）的实心块：给出边界并裁图
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
const P = (code) => ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&blk=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);
if ((await P('STATE.preset')) !== 'album') { await ev(`document.querySelector('iframe[data-id="head"]').contentWindow.eval('send("preset"); "ok"')`); await sleep(2000); }

const shot = await send('Page.captureScreenshot', { format: 'png' });
const dataUrl = 'data:image/png;base64,' + shot.data;
const res = await ev(`(async () => {
  const img = new Image(); img.src = ${JSON.stringify(dataUrl)}; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const dpr = 1.5;
  const W = img.naturalWidth, H = img.naturalHeight;
  const d = g.getImageData(0, 0, W, H).data;
  const lum = (x, y) => { const i = (y * W + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
  // 统计整页里亮度 35~95 的像素分布，按行/列直方图定位块
  const rowCount = new Array(H).fill(0), colCount = new Array(W).fill(0);
  let total = 0;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { const l = lum(x, y); if (l > 35 && l < 95) { rowCount[y]++; colCount[x]++; total++; } }
  const rows = []; for (let y = 0; y < H; y++) if (rowCount[y] > 250) rows.push(y);
  let out = { 中灰像素总数: total, 满足行数: rows.length };
  if (rows.length) {
    const y0 = rows[0], y1 = rows[rows.length - 1];
    // 在这段行里找列直方图的主区间
    const cc = colCount.map((v, x) => ({ x, v })).filter(o => o.v > 0).filter(o => o.x >= 0);
    const xs = []; for (let x = 0; x < W; x++) { let s = 0; for (let y = y0; y <= y1; y += 2) { const l = lum(x, y); if (l > 35 && l < 95) s++; } if (s > (y1 - y0) * 0.25) xs.push(x); }
    out.块 = { 页面CSS: { x0: Math.round(xs[0] / dpr), x1: Math.round(xs[xs.length - 1] / dpr), y0: Math.round(y0 / dpr), y1: Math.round(y1 / dpr) } };
    out.块尺寸CSS = { 宽: Math.round((xs[xs.length - 1] - xs[0]) / dpr), 高: Math.round((y1 - y0) / dpr) };
    // 该点在哪个 iframe 里
    const cx = (xs[0] + xs[xs.length - 1]) / 2 / dpr, cy = (y0 + y1) / 2 / dpr;
    out.中心点 = { x: Math.round(cx), y: Math.round(cy) };
    out.该处的元素 = (() => { const el = document.elementFromPoint(cx, cy); return el ? el.tagName + '.' + (el.className || '-') : 'null'; })();
    for (const f of document.querySelectorAll('iframe')) { const r = f.getBoundingClientRect(); if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) out.所在面板 = f.dataset.id; }
  }
  return JSON.stringify(out, null, 1);
})()`);
console.log(res);
const box = JSON.parse(res).块;
if (box) {
  const clip = { x: box.页面CSS.x0 - 20, y: box.页面CSS.y0 - 20, width: (box.页面CSS.x1 - box.页面CSS.x0) + 40, height: (box.页面CSS.y1 - box.页面CSS.y0) + 40, scale: 2 };
  console.log('裁剪:', JSON.stringify(clip));
  const s2 = await send('Page.captureScreenshot', { format: 'png', clip });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\light-block.png', Buffer.from(s2.data, 'base64'));
  console.log('已存 .dev/light-block.png');
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
