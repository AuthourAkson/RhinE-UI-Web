// 简洁版：播放 → SIGNAL → 读峰值 CV（目标 0.244）→ 截图
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
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&tr=1")');
await sleep(16000);
await S('send("view","playlists"); "ok"');
let rows = [];
for (let i = 0; i < 20 && rows.length < 5; i++) {
  await sleep(700);
  const raw = await ev(`(function(){ const f=document.querySelector('iframe[data-id="playlist"]'); if(!f) return '[]'; const w=f.contentWindow; if(!w||!w.document.querySelector('.prow')) return '[]'; const r=f.getBoundingClientRect(),out=[]; for(const el of w.document.querySelectorAll('.prow')){ if(el.classList.contains('group'))continue; const b=el.getBoundingClientRect(); if(b.height<1)continue; out.push({x:Math.round(r.left+b.left+120),y:Math.round(r.top+b.top+b.height/2),t:el.textContent.trim().slice(0,22)}); } return JSON.stringify(out); })()`);
  try { rows = JSON.parse(raw); } catch (e) { rows = []; }
}
const long = rows.find((r) => /world\.execute/i.test(r.t)) || rows[0];
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: long.x, y: long.y, button: 'left', clickCount: 1, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: long.x, y: long.y, button: 'left', clickCount: 1, buttons: 0 });
await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: long.x, y: long.y, button: 'left', clickCount: 2, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: long.x, y: long.y, button: 'left', clickCount: 2, buttons: 0 });
await sleep(1500);
await S('send("view","signal"); "ok"');
await sleep(3500);
console.log('峰值统计:', await S(`(function(){ const P = Wave.peaks; if (!P || !Wave.loaded) return '未加载'; const a = Array.from(P), n = a.length, mean = a.reduce((x,y)=>x+y,0)/n, sd = Math.sqrt(a.reduce((x,y)=>x+(y-mean)**2,0)/n); return JSON.stringify({ 点数: n, 均值: Math.round(mean*1000), CV: +(sd/mean).toFixed(3), 大于0_9占比: +(a.filter(v=>v>.9).length/n*100).toFixed(1), 前12: a.slice(0,12).map(v=>Math.round(v*1000)).join(',') }); })()`));
console.log('原版真值: {"均值":819,"CV":0.244,"大于0.9占比":40.5,"前12":"74,492,382,551,520,491,536,398,541,387,603,434"}');

// 只裁轨迹那一小条（用主题自己的几何），方便直接和原版截图对比
const shot = await send('Page.captureScreenshot', { format: 'png', clip: await (async () => {
  const stage = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="stage"]').getBoundingClientRect(); return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height}); })()`));
  const gg = JSON.parse(await S('JSON.stringify(signalGeom())'));
  return { x: stage.x + gg.cx - gg.traceW / 2 - 10, y: stage.y + gg.traceY - 24, width: gg.traceW + 20, height: gg.traceH + 40, scale: 1.5 };
})() });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\trace-now-crop.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/trace-now-crop.png（可与 image/轨迹-原版.png 直接对比）');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
