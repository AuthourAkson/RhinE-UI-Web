// 时钟修复验证：量步进宽度 + 按主题几何裁出时钟区域
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 150);
  return r.result.value;
};
const H = (code) => ev(`document.querySelector('iframe[data-id="header"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&clock=3")');
await sleep(17000);

console.log('=== 字宽测量（15px 时钟字体，等宽）===');
console.log(await H(`(function(){
  const f = font(15, 500), g = document.createElement('canvas').getContext('2d'); g.font = f.Css;
  const ink = ch => { const m = g.measureText(ch); return +((m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || 0).toFixed(2); };
  return JSON.stringify({
    冒号_步进实测: +CalcTextWidth(':', f, true).toFixed(2),
    冒号_实际advance: +g.measureText(':').width.toFixed(2),
    冒号_墨迹宽: ink(':'),
    数字1_步进: +CalcTextWidth('1', f, true).toFixed(2),
    数字1_墨迹宽: ink('1'),
    说明: '修复后步进应≈9（等宽 0.6em），墨迹对冒号只有 2~3',
  });
})()`));
console.log('\n整串 "18:17:56" 逐字步进:', await H(`(function(){
  const f = font(15, 500), t = '18:17:56';
  const g = d2d.CreateImage(1,1).GetGraphics();
  const adv = [...t].map(c => +g.CalcTextWidth(c, f, true).toFixed(2));
  return JSON.stringify({ 逐字: adv, 合计: +adv.reduce((a,b)=>a+b,0).toFixed(1), 若按墨迹: null });
})()`));

// 主题自己报的时钟命中区 → 换算成页面坐标裁图
const hit = JSON.parse(await H('(function(){ const a = hits.get("clock"); return JSON.stringify(a || null); })()'));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
console.log('\n时钟命中区（面板内）:', JSON.stringify(hit), ' → 页面坐标 x=' + Math.round(fr.x + hit.x) + ' y=' + Math.round(fr.y + hit.y));
const clip = { x: fr.x + hit.x - 20, y: fr.y + hit.y - 8, width: hit.w + 60, height: hit.h + 20, scale: 3 };   // 放大 3 倍看细节
const shot = await send('Page.captureScreenshot', { format: 'png', clip });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\clock-fixed.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/clock-fixed.png（放大 3 倍）');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
