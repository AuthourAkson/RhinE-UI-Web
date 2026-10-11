// 把原版截图里的 PLAY TRACK / OPEN ALBUM 裁出来，和网页版并排比较
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
const fs = await import('node:fs');

await ev('location.assign("http://127.0.0.1:8300/panel.html")');
await sleep(2500);
// 原版截图：按钮在 (1470..1840, 720..810) 附近（device px，图 2558x1348）
const out = await ev(`(async () => {
  const load = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
  const orig = await load('/image/new.png');
  const c = document.createElement('canvas'); c.width = 420; c.height = 110;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(orig, 1440, 710, 420, 110, 0, 0, 420, 110);
  // 放大 4 倍输出（最近邻，保留原始像素）
  const up = document.createElement('canvas'); up.width = 1680; up.height = 440;
  const u = up.getContext('2d'); u.imageSmoothingEnabled = false;
  u.drawImage(c, 0, 0, 1680, 440);
  return up.toDataURL('image/png');
})()`);
if (typeof out === 'string' && out.startsWith('data:')) {
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\orig-buttons-zoom.png', Buffer.from(out.split(',')[1], 'base64'));
  console.log('已存 .dev/orig-buttons-zoom.png');
} else console.log('裁剪失败:', out);
ws.close();
