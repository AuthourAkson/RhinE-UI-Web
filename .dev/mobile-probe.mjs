// 手机视口实测：390x844 @ dpr3、开启触摸仿真，看主题布局到底怎样、哪里坏
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
const fs = await import('node:fs');

await send('Runtime.enable'); await send('Page.enable');
// iPhone 12/13 级别的视口 + dpr 3 + 触摸
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&mobile=1' });
await sleep(22000);

console.log('视口:', await ev(`innerWidth + 'x' + innerHeight + ' @dpr ' + devicePixelRatio`));
console.log('触摸支持:', await ev(`('ontouchstart' in window) + ' / maxTouchPoints=' + navigator.maxTouchPoints`));
console.log('面板几何（CSS）:');
console.log(await ev(`JSON.stringify([...document.querySelectorAll('iframe')].map(f => {
  const r = f.getBoundingClientRect();
  return f.dataset.id + ':' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + (getComputedStyle(f).display === 'none' ? ' hidden' : '');
}), null, 0)`));
console.log('\n主题侧每个面板拿到的尺寸:');
console.log(await ev(`JSON.stringify([...document.querySelectorAll('iframe')].map(f => {
  try { const w = f.contentWindow; return f.dataset.id + ':' + (w.Width||'?') + 'x' + (w.Height||'?'); } catch(e){ return f.dataset.id + ':EXC'; }
}).filter(s => !/:(\?|0)x/.test(s)), null, 0)`));
console.log('\n画布后备分辨率（前 4 个）:');
console.log(await ev(`JSON.stringify([...document.querySelectorAll('iframe')].slice(0,4).map(f => {
  try { const cv = f.contentWindow.document.querySelector('canvas'); return f.dataset.id + ':' + (cv ? cv.width + 'x' + cv.height : '无'); } catch(e){ return f.dataset.id + ':EXC'; }
}), null, 0)`));
console.log('\n导航命中区（header 里 nav 的位置，看会不会挤出屏幕）:');
console.log(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="header"]');
  try {
    const w = f.contentWindow;
    const ids = [];
    for (const id of ['nav','prefs','menu','clock']) { const h = w.eval('(function(){ try { return JSON.stringify(hits.get("'+id+'")||null); } catch(e){ return null; } })()'); ids.push(id + '=' + h); }
    // nav 可能是数组（多个条目）
    const navs = w.eval('(function(){ try { var out=[]; for (var k of hits.keys ? hits.keys() : []) { } return "?"; } catch(e){ return "EXC"; } })()');
    return ids.join('  ') + '   navs=' + navs;
  } catch (e) { return 'EXC ' + e.message; }
})()`));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\mobile-viewport.png', Buffer.from(shot.data, 'base64'));
console.log('\n控制台错误:', errs.length, errs.slice(0, 4));
console.log('已存 .dev/mobile-viewport.png');
await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
ws.close();
