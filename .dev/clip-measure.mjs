// 量 "UNKNOWN" 这类标签：位图宽度 vs 最后一个字形的墨迹右缘
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
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&clip=1")');
await sleep(17000);
await S('send("view","archive"); "ok"');
await sleep(3000);

console.log('=== 量标签位图 vs 字形墨迹 ===');
console.log(await S(`(function(){
  const probe = (str, st, name) => {
    const f = fontFor(str, stSize ? stSize(st) : st.size, st.weight || 400);
    const gap = (st.track || 0) * dp((stSize ? stSize(st) : st.size) * TEXT_SCALE);
    const g = d2d.CreateImage(1,1).GetGraphics();
    const adv = [...str].map(c => g.CalcTextWidth(c, f, true));
    const ink = [...str].map(c => {           // 该字形相对原点的墨迹右缘
      const m = measureGlyph(c, f);
      return m;
    });
    const w = labelBitmap(str, st).w;
    const sumAdv = adv.reduce((a,b)=>a+b,0) + gap * (adv.length - 1);
    let cx = 0, maxInk = 0, lastInkEnd = 0;
    for (let i = 0; i < str.length; i++) { const end = cx + ink[i]; if (end > maxInk) maxInk = end; lastInkEnd = cx + ink[i]; cx += adv[i] + gap; }
    return name + ' "' + str + '": 位图宽=' + w + '  Σ(步进+字距)=' + sumAdv.toFixed(1)
      + '  最后一个字形墨迹右缘=' + lastInkEnd.toFixed(1) + '  全部墨迹最大=' + maxInk.toFixed(1)
      + '  → 超出位图 ' + (maxInk - w).toFixed(1) + 'px' + (maxInk > w ? '  ✗ 会被裁掉' : '  ✓');
  };
  // 复用主题的测量：用 FontFace 度量墨迹右缘
  const measureGlyph = (ch, f) => {
    const c = document.createElement('canvas').getContext('2d'); c.font = f.Css;
    const m = c.measureText(ch);
    return (m.actualBoundingBoxRight || 0);
  };
  const out = [];
  out.push(probe('UNKNOWN', st(AR_ST.group, C.fg), '货架分组名'));
  out.push(probe('SHELF ', st(AR_ST.sel, C['text-muted']), 'SHELF 标签'));
  out.push(probe('SESSION AUTHORIZED', Object.assign({ colour: 0xffffffff, bg: 0xff000000 }, { size: 30, weight: 700, track: .2 }), '开场大字'));
  out.push(probe('18:17:56', st(ST.time ? ST.time : { size: 15, weight: 500, track: .04 }, C.fg), '时钟'));
  // 逐字形：步进 vs 墨迹右缘
  const f2 = fontFor('UNKNOWN', AR_ST.group.size, AR_ST.group.weight || 400);
  const g2 = d2d.CreateImage(1,1).GetGraphics();
  out.push('逐字（字体 ' + f2.Css + '）: ' + [...'UNKNOWNd'].map(c => {
    const adv = g2.CalcTextWidth(c, f2, true), ink = measureGlyph(c, f2);
    return c + '[步进' + adv.toFixed(1) + ' 墨迹右' + ink.toFixed(1) + (ink > adv ? ' ✗' : '') + ']';
  }).join(' '));
  return out.join('\\n');
})()`));

// 放大截图：货架分组名那一带
const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 560, y: 700, width: 420, height: 90, scale: 4 } });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\zoom-group.png', Buffer.from(shot.data, 'base64'));
console.log('\n已存 .dev/zoom-group.png（货架名区域放大 4 倍）');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
