// 查 SBW（滚动条宽度）与滚动状态，并用低阈值重扫浅色区
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
await ev('location.assign("http://127.0.0.1:8300/?demo=1&sbw=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);
if ((await P('STATE.preset')) !== 'album') { await ev(`document.querySelector('iframe[data-id="head"]').contentWindow.eval('send("preset"); "ok"')`); await sleep(2000); }

console.log('滚动条宽度 SBW =', await P('SBW'), ' (utils.GetSystemMetrics(2) = ' + await P('utils.GetSystemMetrics(2)') + ')');
console.log('滚动容器:', await P(`JSON.stringify((function(){ const r = scroll.getBoundingClientRect(); return { 面板CSS: Math.round(r.width) + 'x' + Math.round(r.height), clientWidth: scroll.clientWidth, clientHeight: scroll.clientHeight, scrollHeight: scroll.scrollHeight, 有滚动条: scroll.scrollHeight > scroll.clientHeight, offsetWidth: scroll.offsetWidth, clientW差: scroll.offsetWidth - scroll.clientWidth }; })())`));
console.log('行数与总高:', await P('JSON.stringify({ rows: rows.length, ROW: ROW, sizer高: sizer.style.height })'));

const shot = await send('Page.captureScreenshot', { format: 'png' });
const dataUrl = 'data:image/png;base64,' + shot.data;
console.log('\n=== 低阈值扫描（面板内 CSS 坐标，亮度>28 且连续>=30px）===');
console.log(await ev(`(async () => {
  const img = new Image(); img.src = ${JSON.stringify(dataUrl)}; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const dpr = 1.5;
  const f = document.querySelector('iframe[data-id="playlist"]').getBoundingClientRect();
  const x0 = Math.round(f.left * dpr), y0 = Math.round(f.top * dpr), W = Math.round(f.width * dpr), H = Math.round(f.height * dpr);
  const d = g.getImageData(x0, y0, W, H).data;
  const lum = (x, y) => { const i = (y * W + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
  let hist = {};
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) { const l = Math.round(lum(x, y) / 10) * 10; hist[l] = (hist[l] || 0) + 1; }
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ':' + v).join('  ');
  // 找亮度 >28 的连续段（>=30px）
  const rows = [];
  for (let y = 0; y < H; y++) {
    let run = 0, best = 0, bs = -1, st = -1;
    for (let x = 0; x < W; x++) { if (lum(x, y) > 28) { if (!run) st = x; run++; if (run > best) { best = run; bs = st; } } else run = 0; }
    if (best >= 30) rows.push({ y, len: best, x0: bs, x1: bs + best - 1 });
  }
  const out = { 亮度分布前6: top };
  if (rows.length) {
    const T = rows[0], B = rows[rows.length - 1];
    const minX = Math.min(...rows.map(r => r.x0)), maxX = Math.max(...rows.map(r => r.x1));
    out.浅色块 = { x0: +(minX / dpr).toFixed(0), x1: +(maxX / dpr).toFixed(0), y0: +(T.y / dpr).toFixed(0), y1: +(B.y / dpr).toFixed(0) };
    out.行样本 = [rows[0], rows[rows.length >> 1], rows[rows.length - 1]];
  } else out.说明 = '没有 >=30px 的连续浅色段（说明不是横向大块，可能是竖条或其他）';
  // 顺便：每列的平均亮度（找竖条）
  const cols = [];
  for (let x = 0; x < W; x += Math.max(1, Math.round(W / 24))) { let s = 0, n = 0; for (let y = 0; y < H; y += 4) { s += lum(x, y); n++; } cols.push(Math.round(x / dpr) + ':' + Math.round(s / n)); }
  out.每列平均亮度 = cols.join(' ');
  return JSON.stringify(out, null, 1);
})()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
