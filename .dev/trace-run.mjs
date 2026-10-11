// 量两张轨迹截图：条高分布、动态范围、条距
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 60000); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 150);
  return r.result.value;
};
await ev('location.assign("http://127.0.0.1:8300/panel.html")');
await new Promise((r) => setTimeout(r, 2000));
console.log(await ev(`(async () => {
  const load = async (url) => {
    const i = new Image(); i.src = url; await i.decode();
    const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0);
    return { W: i.naturalWidth, H: i.naturalHeight, d: x.getImageData(0, 0, i.naturalWidth, i.naturalHeight).data };
  };
  const analyze = (o, name) => {
    const lum = (x, y) => { const i = (y * o.W + x) * 4; return (o.d[i] + o.d[i + 1] + o.d[i + 2]) / 3; };
    const rowCount = [];
    for (let y = 0; y < o.H; y++) { let n = 0; for (let x = 0; x < o.W; x++) if (lum(x, y) > 60) n++; rowCount.push(n); }
    let y0 = -1, y1 = -1;
    for (let y = Math.floor(o.H * 0.45); y < o.H; y++) if (rowCount[y] > o.W * 0.2) { if (y0 < 0) y0 = y; y1 = y; }
    const cols = [];
    for (let x = 0; x < o.W; x++) { let top = -1, bot = -1; for (let y = y0; y <= y1; y++) if (lum(x, y) > 60) { if (top < 0) top = y; bot = y; } cols.push(top < 0 ? 0 : bot - top + 1); }
    const nz = cols.filter((v) => v > 0);
    const gaps = []; let last = -1;
    for (let x = 0; x < cols.length; x++) if (cols[x] > 0) { if (last >= 0) gaps.push(x - last); last = x; }
    gaps.sort((a, b) => a - b);
    const mean = nz.reduce((a, b) => a + b, 0) / nz.length;
    const sd = Math.sqrt(nz.reduce((a, b) => a + (b - mean) ** 2, 0) / nz.length);
    const sorted = nz.slice().sort((a, b) => a - b), q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
    return name + '  ' + o.W + 'x' + o.H + '  条高 min=' + sorted[0] + ' p25=' + q(.25) + ' 中位=' + q(.5) + ' p75=' + q(.75) + ' p90=' + q(.9) + ' max=' + sorted[sorted.length - 1]
      + '  | 均值=' + mean.toFixed(1) + ' 标准差=' + sd.toFixed(2) + ' 变异系数=' + (sd / mean).toFixed(3)
      + '  | 条距中位=' + (gaps[Math.floor(gaps.length / 2)] || 0) + ' 平均=' + (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2)
      + '  | 占列比=' + (nz.length / o.W * 100).toFixed(1) + '%';
  };
  const A = analyze(await load('/image/%E8%BD%A8%E8%BF%B9-%E5%8E%9F%E7%89%88.png'), '原版  ');
  const B = analyze(await load('/image/%E8%BD%A8%E8%BF%B9-web.png'), '网页版');
  return A + '\\n' + B;
})()`));
ws.close();
