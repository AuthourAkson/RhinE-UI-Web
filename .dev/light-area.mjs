// 定位播放列表面板里的"浅色区域"：按坐标取样，看该处是哪个元素、什么背景
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const P = (code) => ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&light=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);
// 确保是 ALBUM 布局（用户看到的那套列：NO. TITLE ARTIST TIME POS）
if ((await P('STATE.preset')) !== 'album') { await ev(`document.querySelector('iframe[data-id="head"]').contentWindow.eval('send("preset"); "ok"')`); await sleep(2000); }
console.log('布局:', await P('STATE.preset'), ' 行数:', await P('rows.length'));

console.log('\n=== 面板 DOM 结构与尺寸 ===');
console.log(await P(`(function(){
  const out = [];
  const walk = (el, d) => {
    if (d > 3) return;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width > 1 && r.height > 1) out.push('  '.repeat(d) + el.tagName + '.' + (el.className || '') + '  ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + '  bg=' + cs.backgroundColor + ' display=' + cs.display + ' z=' + cs.zIndex);
    for (const c of el.children) walk(c, d + 1);
  };
  walk(document.body, 0);
  return out.join('\\n');
})()`));

console.log('\n=== 坐标取样（面板内坐标 → 该处元素）===');
console.log(await P(`(function(){
  const H = document.documentElement.clientHeight, W = document.documentElement.clientWidth;
  const out = [];
  for (const y of [120, 200, 260, 320, 380, 440, 500]) {
    const row = [];
    for (const x of [120, 300, 520, 700, 900, 1000]) {
      const el = document.elementFromPoint(x, y);
      const cs = el ? getComputedStyle(el) : null;
      row.push(x + ':' + (el ? el.tagName + '.' + (el.className || '-') + '/' + (cs.backgroundColor || '?') : 'null'));
    }
    out.push('y=' + y + '  ' + row.join('  '));
  }
  out.push('面板尺寸 ' + W + 'x' + H);
  return out.join('\\n');
})()`));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\playlist-light.png', Buffer.from(shot.data, 'base64'));
console.log('\n已存 .dev/playlist-light.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
