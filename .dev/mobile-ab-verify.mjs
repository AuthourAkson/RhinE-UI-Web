// A+B 验收：
//  ① 手机（coarse pointer, 短边<700）：虚拟桌面 1440×820 + 整体 scale + 触摸点击 + 双指缩放
//  ② 电脑（fine pointer, 1707x899@1.5）：布局与像素必须与改动前一致（不回归）
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 130));
  if (m.method === 'Runtime.exceptionThrown') errs.push('[exception] ' + String(m.params.exceptionDetails.text).slice(0, 130));
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
const ink = () => ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow, cv = w.document.querySelector('canvas');
  const g = cv.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const bg = [d[0], d[1], d[2]];
  let n = 0;
  for (let i = 0; i < d.length; i += 4 * 37) if (Math.abs(d[i]-bg[0]) + Math.abs(d[i+1]-bg[1]) + Math.abs(d[i+2]-bg[2]) > 24) n++;
  return n;
})()`);
const tap = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(60);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const fs = await import('node:fs');

/* ============================ ① 手机 ============================ */
console.log('========== ① 手机（844×390 横屏，dpr3，触摸）==========');
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&m=1' });
await sleep(22000);
console.log('coarse pointer =', await ev(`matchMedia('(pointer: coarse)').matches`), ' maxTouchPoints =', await ev(`navigator.maxTouchPoints`), ' 短边 =', await ev(`Math.min(innerWidth,innerHeight)`));
console.log('#stage:', await ev(`(function(){ const s = document.getElementById('stage'); const r = s.getBoundingClientRect(); return JSON.stringify({ style: s.style.width + 'x' + s.style.height, transform: s.style.transform, rect: Math.round(r.width) + 'x' + Math.round(r.height) }); })()`));
console.log('面板几何:', await ev(`JSON.stringify([...document.querySelectorAll('iframe')].filter(f=>f.getBoundingClientRect().width>0).map(f=>f.dataset.id+':'+Math.round(f.getBoundingClientRect().width)+'x'+Math.round(f.getBoundingClientRect().height)))`));
console.log('stage 画布后备分辨率 / 有效 DPR:', await ev(`(function(){ const f=document.querySelector('iframe[data-id="stage"]'); const cv=f.contentWindow.document.querySelector('canvas'); return cv.width+'x'+cv.height+'  (逻辑 '+f.contentWindow.Width+'x'+f.contentWindow.Height+')'; })()`));
console.log('主题内部尺寸(header/stage/transport):', await ev(`JSON.stringify([...document.querySelectorAll('iframe')].filter(f=>f.getBoundingClientRect().width>0).map(f=>f.dataset.id+':'+f.contentWindow.Width+'x'+f.contentWindow.Height))`));

// —— 真实触摸点击：demo 按钮（它在 body 上、不受缩放影响，正好验证最外层 UI 可点）
let ok = false;
for (let i = 0; i < 25; i++) { ok = (await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); return b && getComputedStyle(b).display==='block'; })()`)) === true; if (ok) break; await sleep(1000); }
const dr = JSON.parse(await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.left+q.width/2,y:q.top+q.height/2}); })()`));
await tap(dr.x, dr.y); await sleep(9000);
console.log('触摸点 demo 按钮 → 曲库文件数:', await ev(`window.__RHINE_DEBUG__.LIB.files.length`));

// —— 触摸点主题画布内部（磁带）：命中区坐标是"虚拟坐标系"里的，需按缩放换算到页面坐标
await S('send("view","archive"); "ok"'); await sleep(3500);
const tapPos = await ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]');
  const r = f.getBoundingClientRect();
  const w = f.contentWindow;
  const vw = w.eval('(function(){ try { return W; } catch(e){ return 0; } })()') || 1440;
  const s = r.width / vw;                              // 实际缩放比（rect 已含 transform）
  const hit = w.eval('(function(){ try { const h = (AR.hits && AR.hits[0]) || null; if (!h) return null; const q = h.quad; return JSON.stringify({ cx: (q[0][0]+q[2][0])/2, cy: (q[0][1]+q[2][1])/2 }); } catch(e){ return null; } })()');
  if (!hit) return null;
  const h = JSON.parse(hit);
  return JSON.stringify({ x: r.left + h.cx * s, y: r.top + h.cy * s, s: s, sel: w.eval('AR.selAlbum') });
})()`);
console.log('磁带命中区（页面坐标）:', tapPos);
if (tapPos && tapPos !== 'null') {
  const p = JSON.parse(tapPos);
  await tap(p.x, p.y); await sleep(3000);
  console.log('触摸磁带后 AR.selAlbum:', await S('AR.selAlbum'), ' （点击前:', p.sel, '）');
}

// —— 双指缩放手势（两个触点都由脚本给出，避免 null 参数）
const before = await ev(`document.getElementById('stage').style.transform`);
const pinch = async (pts) => send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts });
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 380, y: 200, id: 1 }, { x: 460, y: 200, id: 2 }] });
await sleep(80);
await pinch([{ x: 300, y: 200, id: 1 }, { x: 540, y: 200, id: 2 }]);
await sleep(80);
await pinch([{ x: 220, y: 200, id: 1 }, { x: 620, y: 200, id: 2 }]);
await sleep(80);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(600);
console.log('双指前后 transform:\n  前:', before, '\n  后:', await ev(`document.getElementById('stage').style.transform`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\mobile-after.png', Buffer.from(shot.data, 'base64'));
console.log('手机端错误:', errs.length, errs.slice(0, 3));

/* ============================ ② 电脑（不回归） ============================ */
console.log('\n========== ② 电脑 1707×899 @dpr1.5（细指针，必须与改动前一致）==========');
errs.length = 0;
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&d=1' });
await sleep(22000);
console.log('coarse =', await ev(`matchMedia('(pointer: coarse)').matches`), '（应为 false）   ' + '#stage transform =', await ev(`document.getElementById('stage').style.transform || '（无，正确）'`));
console.log('面板几何:', await ev(`JSON.stringify([...document.querySelectorAll('iframe')].filter(f=>f.getBoundingClientRect().width>0).map(f=>f.dataset.id+':'+Math.round(f.getBoundingClientRect().width)+'x'+Math.round(f.getBoundingClientRect().height)))`));
console.log('stage 画布后备分辨率:', await ev(`(function(){ const f=document.querySelector('iframe[data-id="stage"]'); const cv=f.contentWindow.document.querySelector('canvas'); return cv.width+'x'+cv.height; })()`));
await S('send("view","signal"); "ok"'); await sleep(4000);
const v3 = await ink();
await S(`(function(){ Ring.mode='2d'; window.Repaint(); return 'ok'; })()`); await sleep(3000);
const v2 = await ink();
console.log(`基准对照 → 信号中心像素 3d=${v3}（基线 8557）  2d=${v2}（基线 11204）`);
console.log('电脑端错误:', errs.length, errs.slice(0, 3));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
