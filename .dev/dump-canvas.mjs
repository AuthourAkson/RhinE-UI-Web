// 把指定面板 iframe 里的 canvas 导出成 PNG（用来绕开合成器直接看面板画了什么）
// 用法: node .dev/dump-canvas.mjs <panelId> <out.png> [port]
import fs from 'node:fs';

const [, , panelId = 'header', out = '.dev/header.png', port = '9226'] = process.argv;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 20000); });
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

const expr = `(() => {
  const f = document.querySelector('iframe[data-id="${panelId}"]');
  if (!f) return 'NO_IFRAME';
  const cv = f.contentWindow.document.querySelector('canvas');
  if (!cv) return 'NO_CANVAS';
  return cv.toDataURL('image/png');
})()`;
const dataUrl = await ev(expr);
if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
  console.log('导出失败:', dataUrl);
} else {
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(out, buf);
  console.log(`已保存 ${out}  ${(buf.length / 1024).toFixed(1)} KB`);
}
ws.close();
