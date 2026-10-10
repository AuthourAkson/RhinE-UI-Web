// 用 CDP 模拟高 DPI（125%，即原版参考图的缩放），截图与原版对比
// 用法: node .dev/emulate-dpi.mjs [dsf] [cssW] [cssH] [out]
import fs from 'node:fs';
const [, , dsf = '1.25', cssW = '1618', cssH = '933', out = '.dev/dpi-125.png'] = process.argv;
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 30000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

console.log(`模拟 deviceScaleFactor=${dsf}，视口 ${cssW}×${cssH} CSS px`);
await send('Emulation.setDeviceMetricsOverride', {
  width: Number(cssW), height: Number(cssH), deviceScaleFactor: Number(dsf), mobile: false,
});
await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:8300/?demo=1&dpi=${Date.now()}` });
await sleep(16000);
console.log('  dpr =', await ev('window.devicePixelRatio'), ' 主题 DPI =', await ev(`document.querySelector('iframe[data-id=root]').contentWindow.DPI`));
console.log('  切到档案视图');
await ev(`(function(){ const w = document.querySelector('iframe[data-id=root]').contentWindow; if (w.eval('STATE.view') !== 'archive') w.__rhine.call('on_key_down', 0x31); })()`);
await sleep(5000);
const box = await ev(`(function(){ const w = document.querySelector('iframe[data-id=stage]').contentWindow; return w.eval('W + "x" + H'); })()`);
console.log('  stage 逻辑尺寸 =', box);
const r = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
console.log('  已保存', out, '(', (fs.statSync(out).size / 1024).toFixed(0), 'KB )');
ws.close();
