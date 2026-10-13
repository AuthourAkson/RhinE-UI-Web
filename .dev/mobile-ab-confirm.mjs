// 精确确认两点：
//  ① 手机：触摸"另一盘磁带"应让 AR.selAlbum 改变（上次点的是已选中的那盘，看不出变化）
//  ② 电脑：强制 3d 后中心像素应回到基线 8557（上次因持久化的 ringMode=2d 测到了 11204）
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

await send('Runtime.enable'); await send('Page.enable');
console.log('========== ① 手机：触摸第 2 盘磁带 ==========');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&t=1' });
await sleep(22000);
await S('send("view","archive"); "ok"'); await sleep(3500);
const info = await ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]');
  const r = f.getBoundingClientRect(), w = f.contentWindow;
  const vw = w.eval('(function(){ try { return W; } catch(e){ return 1440; } })()');
  const s = r.width / vw;
  const hits = w.eval('(function(){ try { return JSON.stringify((AR.hits||[]).map(h => { const q=h.quad; return { i:h.i, cx:(q[0][0]+q[2][0])/2, cy:(q[0][1]+q[2][1])/2 }; })); } catch(e){ return "[]"; } })()');
  return JSON.stringify({ s: s, left: r.left, top: r.top, hits: JSON.parse(hits), sel: w.eval('AR.selAlbum') });
})()`);
const m = JSON.parse(info);
console.log('缩放比', m.s.toFixed(4), ' 命中区数', m.hits.length, ' 当前选中:', String(m.sel).slice(0, 40));
if (m.hits.length >= 2) {
  const h = m.hits[1];
  console.log('触摸第 2 盘 → 页面坐标', Math.round(m.left + h.cx * m.s), Math.round(m.top + h.cy * m.s), ' (原 i=' + h.i + ')');
  await tap(m.left + h.cx * m.s, m.top + h.cy * m.s);
  await sleep(3500);
  console.log('触摸后 AR.selAlbum =', String(await S('AR.selAlbum')).slice(0, 40), ' →', (await S('AR.selAlbum')) !== m.sel ? '**变了 ✓**' : '未变 ✗');
}
console.log('手机端错误:', errs.length);

console.log('\n========== ② 电脑：强制 3d 回基线 ==========');
errs.length = 0;
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&b=1' });
await sleep(22000);
await S('send("view","signal"); "ok"'); await sleep(3500);
await S(`(function(){ Ring.mode='3d'; window.Repaint(); return 'ok'; })()`); await sleep(3500);
const v3 = await ink();
await S(`(function(){ Ring.mode='2d'; window.Repaint(); return 'ok'; })()`); await sleep(3500);
const v2 = await ink();
await S(`(function(){ Ring.mode='classic'; window.Repaint(); return 'ok'; })()`); await sleep(3500);
const vc = await ink();
console.log(`3d=${v3}（基线 8557）  2d=${v2}（基线 11204）  classic=${vc}（基线 5979）`);
console.log('三项是否都命中基线:', v3 === 8557 && v2 === 11204 && vc === 5979 ? '**是 ✓ 无回归**' : '有偏差（需查）');
console.log('电脑端错误:', errs.length);
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
