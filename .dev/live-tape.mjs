// 线上：载入内置音频库 → 档案页点磁带 → 抓错误 + 画面 + 各淡出档位
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 160));
  if (m.method === 'Runtime.exceptionThrown') errs.push('[exception] ' + String(m.params.exceptionDetails.text).slice(0, 160));
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
const fs = await import('node:fs');

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/' });
await sleep(4000);
// 之前的测试把 view 改成了别的视图（profile 是持久化的）→ 清空存储当全新访客，再重载
await ev('localStorage.clear()');
await send('Page.reload');
await sleep(24000);
await S('send("view","archive"); "ok"');
await sleep(3000);
// 等开场影片放完、demo 按钮真正可见（否则点了个隐藏元素，曲库根本不会载入）
let btnReady = false;
for (let i = 0; i < 30; i++) {
  btnReady = (await ev(`(function(){ const b = document.getElementById('rhine-demo-btn'); return b ? getComputedStyle(b).display === 'block' : false; })()`)) === true;
  if (btnReady) break;
  await sleep(1000);
}
console.log('demo 按钮可见:', btnReady);
// 载入内置音频库
const r = JSON.parse(await ev(`(function(){ const b = document.getElementById('rhine-demo-btn'); const q = b.getBoundingClientRect(); return JSON.stringify({ x: q.left + q.width/2, y: q.top + q.height/2 }); })()`));
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none', buttons: 0 }); await sleep(200);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
await sleep(9000);
console.log('曲库:', await ev(`JSON.stringify({ files: window.__RHINE_DEBUG__.LIB.files.length, tracks: window.__RHINE_DEBUG__.LIB.tracks.length })`));

console.log('\n各淡出档位平均色:', await S(`(function(){
  const src = arrayImages().frost, out = [];
  for (const f of [0, 0.5, 1]) {
    const img = tinted(src, f, 'case' + CASE_DIR);
    const cv = document.createElement('canvas'); cv.width = img.Width; cv.height = img.Height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img.__el, 0, 0, img.__el.width, img.__el.height, 0, 0, img.Width, img.Height);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 17) { s2 += (d[i] + d[i+1] + d[i+2]) / 3; n++; }
    out.push('f=' + f + ' 亮度 ' + Math.round(s2 / n));
  }
  return out.join('  ·  ');
})()`));

// 点一个磁带
const hit = await S(`(function(){ try { const h = (AR.hits && AR.hits[0]) || null; if (!h) return null; const q = h.quad; return JSON.stringify({ cx: q.reduce((s,p)=>s+p[0],0)/q.length, cy: q.reduce((s,p)=>s+p[1],0)/q.length }); } catch (e) { return null; } })()`);
console.log('\n点击命中区:', hit);
if (hit && hit !== 'null') {
  const { cx, cy } = JSON.parse(hit);
  const fr = JSON.parse(await ev(`(function(){ const b = document.querySelector('iframe[data-id="stage"]').getBoundingClientRect(); return JSON.stringify({ x: b.left, y: b.top }); })()`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fr.x + cx, y: fr.y + cy, button: 'none', buttons: 0 }); await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fr.x + cx, y: fr.y + cy, button: 'left', clickCount: 1, buttons: 1 }); await sleep(50);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fr.x + cx, y: fr.y + cy, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(400);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\live-tape.png', Buffer.from(s.data, 'base64'));
  console.log('已存 .dev/live-tape.png');
}
console.log('\n控制台错误:', errs.length, errs.slice(0, 3));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
