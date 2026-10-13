// 线上手机验收 + 截图：844×390 横屏 / 390×844 竖屏
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
const fs = await import('node:fs');

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/' });
await sleep(30000);
await S('send("view","signal"); "ok"'); await sleep(4000);
console.log('线上横屏 #stage:', await ev(`(function(){ const s=document.getElementById('stage'); const r=s.getBoundingClientRect(); return s.style.width+'x'+s.style.height+'  → '+Math.round(r.width)+'x'+Math.round(r.height)+'  '+s.style.transform; })()`));
console.log('面板几何:', await ev(`JSON.stringify([...document.querySelectorAll('iframe')].filter(f=>f.getBoundingClientRect().width>0).map(f=>f.dataset.id+':'+Math.round(f.getBoundingClientRect().width)+'x'+Math.round(f.getBoundingClientRect().height)))`));
console.log('stage 画布:', await ev(`(function(){ const f=document.querySelector('iframe[data-id="stage"]'); const cv=f.contentWindow.document.querySelector('canvas'); return cv.width+'x'+cv.height; })()`));
let s = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\live-mobile-landscape.png', Buffer.from(s.data, 'base64'));
// 触摸切换 LIGHT/DARK 作为线上触摸验收
const md = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="transport"]');
  const w = f.contentWindow, r = f.getBoundingClientRect();
  const W = w.eval('(function(){ try { return W; } catch(e){ return 0; } })()');
  const s = W ? r.width / W : 1;
  for (let y = 4; y < 90; y += 4) for (let x = 4; x < W - 4; x += 4) {
    const a = w.eval('(function(){ try { const a = hits.at(' + x + ',' + y + '); return a ? JSON.stringify({id:a.id,data:a.data}) : null; } catch(e){ return null; } })()');
    if (a) { const o = JSON.parse(a); if (o.id === 'mode' && o.data !== undefined) return JSON.stringify({ x: r.left + x * s, y: r.top + y * s, data: o.data }); }
  }
  return null;
})()`));
console.log('mode 命中区:', JSON.stringify(md), ' MODE 前 =', await S('MODE'));
if (md) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: md.x, y: md.y, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(3500);
  console.log('触摸后 MODE =', await S('MODE'), (await S('MODE')) !== 'dark' || md.data === 'light' ? '✓' : '');
  s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\live-mobile-light.png', Buffer.from(s.data, 'base64'));
}
// 竖屏
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send('Page.reload');
await sleep(28000);
console.log('\n线上竖屏 #stage:', await ev(`(function(){ const s=document.getElementById('stage'); const r=s.getBoundingClientRect(); return s.style.transform+'  → '+Math.round(r.width)+'x'+Math.round(r.height); })()`));
s = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\live-mobile-portrait.png', Buffer.from(s.data, 'base64'));
console.log('控制台错误:', errs.length, errs.slice(0, 3));
console.log('已存 .dev/live-mobile-landscape.png / live-mobile-light.png / live-mobile-portrait.png');
await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
ws.close();
