// 客观量化：标签位图绘制在奇/偶 CSS 坐标下的"发虚程度"（中间灰占比），以及播放时间是否逐帧推进
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

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&snap=1")');
await sleep(17000);
await S('send("view","archive"); "ok"');
await sleep(3000);

console.log('=== 位图绘制的中间灰占比（越低越锐利）===');
console.log(await S(`(function(){
  // 在一个离屏画布上，把同一个标签位图分别画在偶数与奇数 CSS 坐标，统计中间灰占比
  const measure = (x) => {
    const d = 1.5;
    const cv = document.createElement('canvas'); cv.width = 260 * d; cv.height = 40 * d;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = '#1b1c18'; g.fillRect(0, 0, 260, 40);
    const L = labelBitmap('SIGNAL PROFILE', st({ size: 9, weight: 600, track: .16, colour: 0xfff2f1ec, bg: 0xff1b1c18 }));
    // 直接调主题的 label() 会走 shim 的 DrawImage（已吸附），这里用原生 drawImage 做对照：
    const raw = L.img.__el, sd = L.img.__dpr || 1;
    g.drawImage(raw, 0, 0, L.w * sd, L.h * sd, x, 8, L.w, L.h);
    const px = g.getImageData(0, 0, cv.width, cv.height).data;
    let mid = 0, solid = 0;
    for (let i = 0; i < px.length; i += 4) {
      const l = (px[i] + px[i + 1] + px[i + 2]) / 3;
      if (l > 30 && l < 200) mid++; else if (l >= 200) solid++;
    }
    return { x, 中间灰: mid, 亮像素: solid, 中间灰占比: +(mid / Math.max(1, mid + solid) * 100).toFixed(1) + '%' };
  };
  return JSON.stringify({ 偶数x10: measure(10), 奇数x11: measure(11), 偶数x20: measure(20), 奇数x21: measure(21) }, null, 1);
})()`));

console.log('\n=== 播放时间是否逐帧推进 ===');
await S('(function(){ const h = fb.GetNowPlaying(); return "ok"; })()');
await S('send("view","archive"); "ok"');
// 播放第一首
await ev(`window.__RHINE_DEBUG__.playIndex(0)`);
await sleep(2500);
const samples = [];
for (let i = 0; i < 8; i++) {
  samples.push(await S('+fb.PlaybackTime.toFixed(3)'));
  await sleep(120);
}
console.log('每 120ms 采样一次 fb.PlaybackTime（应每次都不同、约 +0.12）:');
console.log('  ' + samples.join('  '));
const deltas = samples.slice(1).map((v, i) => +(v - samples[i]).toFixed(3));
console.log('  相邻差值:', deltas.join(' '));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
