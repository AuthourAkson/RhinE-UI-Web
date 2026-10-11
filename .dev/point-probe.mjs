// 在灰区里逐点取样：元素链 + 计算背景 + 画布像素
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

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&pt=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);
if ((await P('STATE.preset')) !== 'album') { await ev(`document.querySelector('iframe[data-id="head"]').contentWindow.eval('send("preset"); "ok"')`); await sleep(2000); }

console.log(await P(`(function(){
  const out = [];
  const probe = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const chain = [];
    let e = el;
    while (e && chain.length < 5) { const cs = getComputedStyle(e); chain.push(e.tagName + '.' + (e.className || '-') + '[' + cs.backgroundColor + ']'); e = e.parentElement; }
    let px = '?';
    try { const cv = document.querySelector('canvas'), g = cv.getContext('2d'), dpr = devicePixelRatio || 1; const d = g.getImageData(Math.round(x*dpr), Math.round(y*dpr), 1, 1).data; px = d[0]+','+d[1]+','+d[2]+','+d[3]; } catch (err) { px = 'ERR'; }
    out.push('面板内(' + x + ',' + y + ')  画布像素=' + px + '\\n    链: ' + chain.join(' < '));
  };
  probe(120, 300);   // 左侧（黑区）
  probe(600, 300);   // 灰区左缘附近
  probe(800, 50);    // 灰区右上（组行）
  probe(800, 300);   // 灰区中部
  probe(800, 550);   // 灰区底部
  probe(1020, 300);  // 最右
  out.push('画布: ' + (function(){ const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height) + ' 后备 ' + cv.width + 'x' + cv.height + ' CSS尺寸 ' + cv.style.width + 'x' + cv.style.height; })());
  out.push('scroll/layer/sizer: ' + [['scroll', scroll], ['layer', layer], ['sizer', sizer]].map(([n, e]) => { const r = e.getBoundingClientRect(); return n + '=' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); }).join('  '));
  return out.join('\\n');
})()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
