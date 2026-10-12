// 验证颜色矩阵修复：
//  ① 主题自己的 tinted(frost, f) 在 f=0/0.3/0.6/1 时平均色必须**不同**（修复前完全相同 → 所以是"突变"）
//  ② 点击磁带后的过渡帧（截图序列）
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 220);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&tapefix=1' });
await sleep(20000);
await S('send("view","archive"); "ok"');
await sleep(3000);

console.log('=== ① 主题 tinted() 各档位平均色（修复后应逐档变化）===');
console.log(await S(`(function(){
  const src = arrayImages().frost;
  const out = [];
  for (const f of [0, 0.3, 0.6, 1]) {
    const img = tinted(src, f, 'case' + CASE_DIR);
    const cv = document.createElement('canvas'); cv.width = img.Width; cv.height = img.Height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img.__el, 0, 0, img.__el.width, img.__el.height, 0, 0, img.Width, img.Height);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 17) { r += d[i]; gg += d[i+1]; b += d[i+2]; n++; }
    out.push('f=' + f + ' → 平均色 (' + Math.round(r/n) + ',' + Math.round(gg/n) + ',' + Math.round(b/n) + ')');
  }
  return out.join('\\n   ');
})()`));

console.log('\n=== ② 点击第一个磁带外壳，抓过渡帧 ===');
const hit = await S(`(function(){
  try {
    const h = (AR.hits && AR.hits[0]) || null;
    if (!h) return null;
    const q = h.quad, cx = q.reduce((s,p)=>s+p[0],0)/q.length, cy = q.reduce((s,p)=>s+p[1],0)/q.length;
    return JSON.stringify({ i: h.i, cx: cx, cy: cy });
  } catch (e) { return 'EXC ' + e.message; }
})()`);
console.log('  命中区中心:', hit);
if (hit && hit !== 'null') {
  const { cx, cy } = JSON.parse(hit);
  const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="stage"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
  const px = fr.x + cx, py = fr.y + cy;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, button: 'none', buttons: 0 }); await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1, buttons: 1 }); await sleep(50);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1, buttons: 0 });
  // 抓 6 帧（间隔约 90ms）
  for (let i = 0; i < 6; i++) {
    await sleep(90);
    const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, px - 200), y: Math.max(0, py - 150), width: 400, height: 300, scale: 2 } });
    fs.writeFileSync(`D:\\AgentTestLab\\RhinE-UI\\.dev\\tape-frame-${i}.png`, Buffer.from(s.data, 'base64'));
  }
  console.log('  已存 .dev/tape-frame-0..5.png（点击后 ~90ms 一帧）');
  console.log('  选中态:', await S(`JSON.stringify({ selAlbum: AR.selAlbum, 该外壳 clear: (function(){ try { const r = AR.rows.get(AR.group); return r && r.cases.get(0) ? r.cases.get(0).clear.t.toFixed(2) : '?'; } catch(e){ return '?'; } })() })`));
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
