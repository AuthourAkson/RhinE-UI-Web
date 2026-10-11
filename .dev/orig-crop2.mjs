// 在原版截图里找白色按钮底板，裁出来放大
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
const fs = await import('node:fs');

await ev('location.assign("http://127.0.0.1:8300/panel.html")');
await sleep(2500);
const res = await ev(`(async () => {
  const i = new Image(); i.src = '/image/new.png'; await i.decode();
  const W = i.naturalWidth, H = i.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const lum = (x, y) => { const k = (y * W + x) * 4; return (d[k] + d[k + 1] + d[k + 2]) / 3; };
  // 在右下半区找"亮块"（按钮底板近白）
  let minX = W, minY = H, maxX = 0, maxY = 0, n = 0;
  for (let y = Math.round(H * 0.45); y < H; y += 1) for (let x = Math.round(W * 0.45); x < W; x += 1) {
    if (lum(x, y) > 190) { n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (n < 200) return JSON.stringify({ 说明: '没找到亮块', 亮像素: n });
  return JSON.stringify({ 图: W + 'x' + H, 亮像素: n, 包围盒: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } });
})()`);
console.log(res);
const b = JSON.parse(res).包围盒;
if (b) {
  const up = await ev(`(async () => {
    const i = new Image(); i.src = '/image/new.png'; await i.decode();
    const c = document.createElement('canvas'); c.width = ${b.w + 40}; c.height = ${b.h + 40};
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(i, ${b.x - 20}, ${b.y - 20}, ${b.w + 40}, ${b.h + 40}, 0, 0, ${b.w + 40}, ${b.h + 40});
    const up = document.createElement('canvas'); up.width = (${b.w + 40}) * 4; up.height = (${b.h + 40}) * 4;
    const u = up.getContext('2d'); u.imageSmoothingEnabled = false;
    u.drawImage(c, 0, 0, up.width, up.height);
    return up.toDataURL('image/png');
  })()`);
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\orig-buttons-zoom.png', Buffer.from(up.split(',')[1], 'base64'));
  console.log('已存 .dev/orig-buttons-zoom.png（4 倍，最近邻）');
}
ws.close();
