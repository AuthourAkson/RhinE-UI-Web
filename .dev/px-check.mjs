// 数值验证：灰区中心的像素颜色（修复后应为深色）
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

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&px=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);
console.log('面板样式:', await P(`JSON.stringify({ html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor, canvas: getComputedStyle(document.querySelector('canvas')).backgroundColor, C_bg: typeof C !== 'undefined' ? C.bg : '无C', cssCbg: typeof C !== 'undefined' ? css(C.bg) : '?' })`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
const dataUrl = 'data:image/png;base64,' + shot.data;
console.log('灰区采样（页面CSS 1100,500 / 1100,700 / 700,500 / 400,500）:', await ev(`(async () => {
  const img = new Image(); img.src = ${JSON.stringify(dataUrl)}; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const dpr = 1.5;
  const px = (x, y) => { const d = g.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data; return d[0] + ',' + d[1] + ',' + d[2]; };
  return [ [1100, 500], [1100, 700], [700, 500], [400, 500], [1100, 220] ].map(([x, y]) => x + ',' + y + '=' + px(x, y)).join('   ');
})()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
