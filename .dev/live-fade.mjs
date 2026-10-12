// 线上：验证选中时的渐变（清空存储当全新访客 → 载入内置音频库 → 点磁带 → 采样亮度序列）
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 140));
  if (m.method === 'Runtime.exceptionThrown') errs.push('[exception] ' + String(m.params.exceptionDetails.text).slice(0, 140));
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const winLum = () => S(`(function(){
  try {
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d', { willReadFrequently: true });
    const dpr = window.devicePixelRatio || 1;
    const h = AR.hits && AR.hits[0]; if (!h) return -1;
    const q = h.quad, cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2;
    const d = g.getImageData(Math.round((cx-40)*dpr), Math.round((cy-30)*dpr), Math.round(60*dpr), Math.round(50*dpr)).data;
    let s = 0, n = 0; for (let i = 0; i < d.length; i += 4) { s += (d[i]+d[i+1]+d[i+2])/3; n++; }
    return Math.round(s / n);
  } catch (e) { return -2; }
})()`);
const fs = await import('node:fs');

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/' });
await sleep(5000);
await ev('localStorage.clear()');
await send('Page.reload');
await sleep(24000);
await S('send("view","archive"); "ok"');
await sleep(2500);
let ok = false;
for (let i = 0; i < 25; i++) { ok = (await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); return b && getComputedStyle(b).display==='block'; })()`)) === true; if (ok) break; await sleep(1000); }
console.log('demo 按钮可见:', ok);
const r = JSON.parse(await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.left+q.width/2,y:q.top+q.height/2}); })()`));
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none', buttons: 0 }); await sleep(150);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(40);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
await sleep(9000);
console.log('曲库:', await ev(`JSON.stringify({ files: window.__RHINE_DEBUG__.LIB.files.length })`));

const hit = await S(`(function(){ try { const h=(AR.hits&&AR.hits[0])||null; if(!h) return null; const q=h.quad; return JSON.stringify({cx:(q[0][0]+q[2][0])/2, cy:(q[0][1]+q[2][1])/2}); } catch(e){ return null; } })()`);
console.log('命中区:', hit);
const { cx, cy } = JSON.parse(hit);
const fr = JSON.parse(await ev(`(function(){ const b=document.querySelector('iframe[data-id="stage"]').getBoundingClientRect(); return JSON.stringify({x:b.left,y:b.top}); })()`));
console.log('点击前窗口亮度:', await winLum());
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fr.x + cx, y: fr.y + cy, button: 'none', buttons: 0 }); await sleep(150);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fr.x + cx, y: fr.y + cy, button: 'left', clickCount: 1, buttons: 1 }); await sleep(30);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fr.x + cx, y: fr.y + cy, button: 'left', clickCount: 1, buttons: 0 });
const seq = [];
for (let i = 0; i < 16; i++) { seq.push(await winLum()); await sleep(55); }
console.log('点击后亮度序列:', seq.join(' → '));
console.log('不同取值个数:', [...new Set(seq)].length);
console.log('控制台错误:', errs.length, errs.slice(0, 2));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\live-fade.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/live-fade.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
