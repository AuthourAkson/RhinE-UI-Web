// 逐面板采样：那块浅色到底画在谁的画布上
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
await ev('location.assign("http://127.0.0.1:8300/?demo=1&who=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);
if ((await ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.STATE.preset`)) !== 'album') {
  await ev(`document.querySelector('iframe[data-id="head"]').contentWindow.eval('send("preset"); "ok"')`);
  await sleep(2000);
}

// 页面坐标的一个"浅色区"采样点（从截图估：device 700,400 → CSS 467,267）
const PX = 467, PY = 267;
console.log('页面坐标采样点:', PX, PY, '（页面截图上的像素值）');
console.log(await ev(`(function(){
  // 用页面上的 iframe 逐个判断：该点落在哪个 iframe 内，取其画布像素
  const out = [];
  for (const f of document.querySelectorAll('iframe')) {
    const r = f.getBoundingClientRect();
    if (${PX} < r.left || ${PX} > r.right || ${PY} < r.top || ${PY} > r.bottom) { out.push(f.dataset.id + ': 不在范围内'); continue; }
    const lx = Math.round((${PX} - r.left)), ly = Math.round((${PY} - r.top));
    let px = '?';
    try {
      const w = f.contentWindow, d = w.document;
      const cv = d.querySelector('canvas');
      const g = cv.getContext('2d');
      const dpr = w.devicePixelRatio || 1;
      const d2 = g.getImageData(Math.round(lx * dpr), Math.round(ly * dpr), 1, 1).data;
      px = 'rgba(' + d2[0] + ',' + d2[1] + ',' + d2[2] + ',' + d2[3] + ')';
    } catch (e) { px = 'ERR ' + e.message; }
    out.push(f.dataset.id + ': 面板内(' + lx + ',' + ly + ') 画布像素=' + px);
  }
  return out.join('\\n');
})()`));

// 再扫一条竖线：从 y=200 到 y=460，看浅色区上下边界出现在哪个面板
console.log('\n=== 沿 x=467 竖扫（页面坐标 → 各面板画布像素）===');
for (const y of [200, 230, 260, 300, 360, 420, 470]) {
  const r = await ev(`(function(){
    const out = [];
    for (const f of document.querySelectorAll('iframe')) {
      const b = f.getBoundingClientRect();
      if (467 < b.left || 467 > b.right || ${y} < b.top || ${y} > b.bottom) continue;
      const lx = Math.round(467 - b.left), ly = Math.round(${y} - b.top);
      let px = '?';
      try {
        const w = f.contentWindow, cv = w.document.querySelector('canvas'), g = cv.getContext('2d');
        const dpr = w.devicePixelRatio || 1;
        const d2 = g.getImageData(Math.round(lx * dpr), Math.round(ly * dpr), 1, 1).data;
        px = d2[0] + ',' + d2[1] + ',' + d2[2] + ',' + d2[3];
      } catch (e) { px = 'ERR'; }
      out.push(f.dataset.id + '=' + px);
    }
    return out.join('  ');
  })()`);
  console.log('y=' + y + '  ' + r);
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
