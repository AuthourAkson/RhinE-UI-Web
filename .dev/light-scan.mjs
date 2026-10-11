// 扫描页面截图，找出播放列表区域里的"浅色实心块"并给出精确边界（CSS 坐标）
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
await ev('location.assign("http://127.0.0.1:8300/?demo=1&scan=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);
if ((await P('STATE.preset')) !== 'album') { await ev(`document.querySelector('iframe[data-id="head"]').contentWindow.eval('send("preset"); "ok"')`); await sleep(2000); }

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\scan.png', Buffer.from(shot.data, 'base64'));
const dataUrl = 'data:image/png;base64,' + shot.data;

// 在页面里分析：找播放列表面板范围内、亮度较高且**成片**的像素块
console.log(await ev(`(async () => {
  const img = new Image(); img.src = ${JSON.stringify(dataUrl)}; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const dpr = 1.5;
  const f = document.querySelector('iframe[data-id="playlist"]').getBoundingClientRect();
  const x0 = Math.round(f.left * dpr), y0 = Math.round(f.top * dpr), x1 = Math.round(f.right * dpr), y1 = Math.round(f.bottom * dpr);
  const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  const W = x1 - x0, H = y1 - y0;
  const lum = (x, y) => { const i = (y * W + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
  // 每行统计"亮且连续 >= 40px"的最长段
  const rows = [];
  for (let y = 0; y < H; y += 1) {
    let best = 0, run = 0, bestStart = -1, start = -1;
    for (let x = 0; x < W; x++) {
      if (lum(x, y) > 70) { if (!run) start = x; run++; if (run > best) { best = run; bestStart = start; } }
      else run = 0;
    }
    if (best >= 40) rows.push({ y, len: best, x0: bestStart, x1: bestStart + best - 1 });
  }
  if (!rows.length) return '没找到成片的浅色区';
  const top = rows[0], bot = rows[rows.length - 1];
  const minX = Math.min(...rows.map(r => r.x0)), maxX = Math.max(...rows.map(r => r.x1));
  const CSS = (v) => +(v / dpr).toFixed(0);
  return JSON.stringify({
    面板CSS范围: { x: Math.round(f.left), y: Math.round(f.top), w: Math.round(f.width), h: Math.round(f.height) },
    浅色块在面板内的CSS坐标: { x0: CSS(minX), x1: CSS(maxX), y0: CSS(top.y), y1: CSS(bot.y), 宽: CSS(maxX - minX), 高: CSS(bot.y - top.y) },
    页面CSS坐标: { x0: Math.round(f.left) + CSS(minX), x1: Math.round(f.left) + CSS(maxX), y0: Math.round(f.top) + CSS(top.y), y1: Math.round(f.top) + CSS(bot.y) },
    前几行: rows.slice(0, 3), 后几行: rows.slice(-3),
  }, null, 1);
})()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
