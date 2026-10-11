// 验证：字体位映射修正后，粗体标签是否恢复真粗体、中文是否还斜
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
await ev('location.assign("http://127.0.0.1:8300/?demo=1&font=1")');
await sleep(17000);
await S('send("view","archive"); "ok"');
await sleep(3000);

console.log('=== 字体构造（style 0 / 1）===');
console.log(await S(`(function(){
  const a = d2d.Font('Geist Mono', 22, 0), b = d2d.Font('Geist Mono', 22, 1);
  const c = d2d.Font('Microsoft YaHei UI', 18, 0), d = d2d.Font('Microsoft YaHei UI', 18, 1);
  return JSON.stringify({ '常规(style0)': a.Css, '粗体(style1)': b.Css, 'CJK常规': c.Css, 'CJK粗体': d.Css }, null, 1);
})()`));
console.log('\n字体是否真的可用（真粗体 vs 合成）:');
console.log(await ev(`JSON.stringify({
  'Geist Mono 400': document.fonts.check('400 22px "Geist Mono"'),
  'Geist Mono 700': document.fonts.check('700 22px "Geist Mono"'),
  'YaHei 400': document.fonts.check('400 18px "Microsoft YaHei UI"'),
  'YaHei 700': document.fonts.check('700 18px "Microsoft YaHei UI"'),
  '已注册的 FontFace 数': document.fonts.size,
})`));

console.log('\n=== 标签位图（分辨率应 = 逻辑尺寸 × dpr 1.5）===');
console.log(await S(`(function(){
  const L = labelBitmap('ARCHIVE', st({ size: 10, weight: 600, track: .16, colour: C.fg, bg: C.bg }));
  const img = L.img;
  return JSON.stringify({ 逻辑: L.w + 'x' + L.h, 后备: img.__el ? img.__el.width + 'x' + img.__el.height : '?', dpr: img.__dpr || 1, 字体: fontFor('ARCHIVE', 10, 600).Css });
})()`));

// 裁几处文字放大看
const stage = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="stage"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
const crops = [
  ['header-nav', 0, 0, 700, 73],
  ['archive-toolbar', stage.x + 380, stage.y + 0, 720, 130],
  ['shelf-group', stage.x + 520, stage.y + 690, 460, 80],
];
for (const [name, x, y, w, h] of crops) {
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 3 } });
  fs.writeFileSync(`D:\\AgentTestLab\\RhinE-UI\\.dev\\text-${name}.png`, Buffer.from(s.data, 'base64'));
  console.log('已存 .dev/text-' + name + '.png');
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
