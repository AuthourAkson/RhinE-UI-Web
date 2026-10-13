// 关键：非 archive 配色下 accentShift() 生成的"旋转副本"到底是不是空的
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 260);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&accentshift=1' });
await sleep(18000);
await S('send("view","signal"); "ok"');
await sleep(4000);
await ev(`window.__RHINE_CMD__('import:${JSON.stringify({ scheme: 'flare', mode: 'light' })}')`);
await sleep(5000);

console.log('=== accentShift 前后对比（ring 原图 vs 旋转副本）===');
console.log(await S(`(function(){
  const src = Ring.img.still;
  const stat = (img, label) => {
    if (!img) return label + ': null';
    const cv = document.createElement('canvas');
    cv.width = img.__el.width; cv.height = img.__el.height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img.__el, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let opaque = 0, sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 53) { if (d[i+3] > 8) opaque++; sum += d[i] + d[i+1] + d[i+2]; n++; }
    return label + ': ' + img.Width + 'x' + img.Height + '  ready=' + !!img.__ready + '  不透明采样=' + opaque + '/' + n + '  平均亮度=' + Math.round(sum / Math.max(1, n) / 3);
  };
  const out = [stat(src, '原图 ring'), stat(Ring.img.shadow, '阴影')];
  try { const sh = accentShift(src); out.push(stat(sh, 'accentShift(ring)')); } catch (e) { out.push('accentShift(ring) 抛错: ' + e.message); }
  try { const sh2 = accentShift(Ring.img.shadow); out.push(stat(sh2, 'accentShift(阴影)')); } catch (e) { out.push('accentShift(阴影) 抛错: ' + e.message); }
  // 直接测 Effect + DrawEffect 这条链路
  try {
    const fx = accentEffect(src);
    out.push('accentEffect(ring) = ' + (fx ? '有' : 'null') + '  矩阵前 4 个值: ' + (fx && fx.__m ? [fx.__m[0].toFixed(3), fx.__m[1].toFixed(3), fx.__m[2].toFixed(3), fx.__m[4].toFixed(3)].join(', ') : '无'));
    const tmp = d2d.CreateImage(src.Width, src.Height), gg = tmp.GetGraphics();
    gg.DrawEffect(fx, 0, 0, 0, 0, src.Width, src.Height);
    tmp.ReleaseGraphics(gg);
    out.push(stat(tmp, '手动 DrawEffect 结果'));
  } catch (e) { out.push('手动链路抛错: ' + e.message); }
  return out.join('\\n   ');
})()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
