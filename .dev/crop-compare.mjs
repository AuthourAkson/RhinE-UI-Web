// 把两张图的同一区域裁出来上下拼接，存成对照图（然后人工看图）
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 40000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const fs = await import('node:fs');

// 裁切区域（设备像素，两图都是 2023 宽 @150%）：磁带 + 导轨近端
const CLIP = { x: 140, y: 280, w: 1000, h: 880 };
const build = await ev(`(async () => {
  const load = async (url) => { const i = new Image(); i.src = url; await i.decode(); return i; };
  const A = await load('/image/archieve-%E5%8E%9F%E7%89%88.png');
  const B = await load('/.dev/cmp-1album-1349.png');
  const C = { x: ${CLIP.x}, y: ${CLIP.y}, w: ${CLIP.w}, h: ${CLIP.h} };
  const cv = document.createElement('canvas');
  cv.width = C.w; cv.height = C.h * 2 + 24;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#ff00aa'; cx.fillRect(0, 0, cv.width, cv.height);
  cx.drawImage(A, C.x, C.y, C.w, C.h, 0, 0, C.w, C.h);                    // 上：原版
  cx.drawImage(B, C.x, C.y, C.w, C.h, 0, C.h + 24, C.w, C.h);             // 下：我的
  cx.fillStyle = '#fff'; cx.font = '20px sans-serif';
  cx.fillText('上 = 原版参考   下 = 移植版（同尺寸同曲库）', 8, C.h + 18);
  document.body.style.margin = '0'; document.body.innerHTML = '';
  document.body.appendChild(cv);
  return cv.width + 'x' + cv.height;
})()`);
console.log('对照图尺寸:', build);
await send('Emulation.setDeviceMetricsOverride', { width: CLIP.w, height: CLIP.h * 2 + 24, deviceScaleFactor: 1, mobile: false });
await sleep(600);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\side-by-side.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/side-by-side.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
