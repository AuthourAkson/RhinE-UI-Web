// 验证：经 shim 的 DrawImage（已吸附设备像素）后，奇/偶位置中间灰占比应当一致；并看播放推进
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
await ev('location.assign("http://127.0.0.1:8300/?demo=1&snap2=1")');
await sleep(17000);

console.log('=== 经 shim 的 gr.DrawImage（吸附设备像素后）===');
console.log(await S(`(function(){
  const stat = (x) => {
    const cv = d2d.CreateImage(260, 40), g = cv.GetGraphics();
    g.FillSolidRect(0, 0, 260, 40, 0xff1b1c18);
    const L = labelBitmap('SIGNAL PROFILE', st({ size: 9, weight: 600, track: .16, colour: 0xfff2f1ec, bg: 0xff1b1c18 }));
    g.DrawImage(L.img, x, 8, L.w, L.h, 0, 0, L.w, L.h);
    cv.ReleaseGraphics(g);
    const el = cv.__el, c2 = document.createElement('canvas'); c2.width = el.width; c2.height = el.height;
    const g2 = c2.getContext('2d', { willReadFrequently: true }); g2.drawImage(el, 0, 0);
    const px = g2.getImageData(0, 0, c2.width, c2.height).data;
    let mid = 0, solid = 0;
    for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i+1] + px[i+2]) / 3; if (l > 30 && l < 200) mid++; else if (l >= 200) solid++; }
    return { x, 中间灰: mid, 亮: solid, 占比: +(mid / Math.max(1, mid + solid) * 100).toFixed(1) + '%' };
  };
  return JSON.stringify({ x10: stat(10), x11: stat(11), x21: stat(21) }, null, 1);
})()`));

console.log('\n=== 播放时间逐帧推进 ===');
await ev(`window.__RHINE_DEBUG__.playIndex(0)`);
await sleep(2500);
const s1 = [];
for (let i = 0; i < 10; i++) { s1.push(await S('+fb.PlaybackTime.toFixed(3)')); await sleep(100); }
console.log('每 100ms 采样 fb.PlaybackTime:');
console.log('  ' + s1.join(' '));
console.log('  相邻差值:', s1.slice(1).map((v, i) => +(v - s1[i]).toFixed(3)).join(' '));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
