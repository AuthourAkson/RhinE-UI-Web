// 改完取值方式后：验证 ① 分布贴近原版 ② 播放中画面正常
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');
const dbl = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2, buttons: 0 });
  await sleep(700);
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&fix=1")');
await sleep(16000);
await S('send("view","playlists"); "ok"');
let rows = [];
for (let i = 0; i < 20 && rows.length < 5; i++) {
  await sleep(700);
  const raw = await ev(`(function(){ const f=document.querySelector('iframe[data-id="playlist"]'); if(!f) return '[]'; const w=f.contentWindow; if(!w||!w.document.querySelector('.prow')) return '[]'; const r=f.getBoundingClientRect(),out=[]; for(const el of w.document.querySelectorAll('.prow')){ if(el.classList.contains('group'))continue; const b=el.getBoundingClientRect(); if(b.height<1)continue; out.push({x:Math.round(r.left+b.left+120),y:Math.round(r.top+b.top+b.height/2),t:el.textContent.trim().slice(0,22)}); } return JSON.stringify(out); })()`);
  try { rows = JSON.parse(raw); } catch (e) { rows = []; }
}
const long = rows.find((r) => /world\.execute/i.test(r.t)) || rows[0];
console.log('播放:', long.t);
await dbl(long.x, long.y);
await sleep(1500);
await S('send("view","signal"); "ok"');
await sleep(3000);
console.log('波形分布（新算法）:', await S(`(function(){
  const P = Wave.peaks; if (!P || !Wave.loaded) return '还没加载完';
  const a = Array.from(P), n = a.length, s = a.slice().sort((x,y)=>x-y), q = p => s[Math.floor(p*(n-1))];
  return JSON.stringify({ 点数: n, 均值: Math.round(a.reduce((x,y)=>x+y,0)/n*1000), p50: Math.round(q(.5)*1000), p90: Math.round(q(.9)*1000), 大于0_9占比: +(a.filter(v=>v>.9).length/n*100).toFixed(1), 前12: a.slice(0,12).map(v=>Math.round(v*1000)).join(','), 末12: a.slice(-12).map(v=>Math.round(v*1000)).join(',') });
})()`));
console.log('原版对照:        {"均值":819,"p50":875,"p90":998,">0.9":40.5,"前12":"74,492,382,551,520,491,536,398,541,387,603,434"}');
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\' + n, Buffer.from(s.data, 'base64')); };
await shot('trace-fixed.png'); await sleep(1500); await shot('trace-fixed2.png');
console.log('已存 trace-fixed.png / trace-fixed2.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
