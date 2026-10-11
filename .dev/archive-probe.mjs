// 看档案视图里 musiclab 专辑下的曲目行
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 130);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&arch=1")');
await sleep(17000);
await S('send("view","archive"); "ok"');
await sleep(3500);
console.log('专辑与曲目数:', await S(`(function(){
  const A = (typeof ALBUMS !== 'undefined') ? ALBUMS : null;
  if (!A) return '拿不到 ALBUMS';
  return JSON.stringify(A.map(a => ({ 标题: a.title || a.album, 艺人: a.artist || '', 曲目数: (a.idx || a.rows || []).length })));
})()`));
// 把主题画的曲目行文字抓出来（album.js 用 TitleFormat 求值）
console.log('\n每张专辑的曲目行（用主题自己的 TitleFormat 求值）:', await S(`(function(){
  const A = (typeof ALBUMS !== 'undefined') ? ALBUMS : null;
  if (!A) return '拿不到';
  const out = [];
  for (const a of A.slice(0, 3)) {
    const rows = a.idx || a.rows || [];
    out.push('专辑 ' + (a.title || a.album) + '（' + rows.length + ' 首）');
    for (const r of rows.slice(0, 8)) {
      const h = (typeof r === 'object' && r && r.handle) ? r.handle : (typeof rowHandle === 'function' ? rowHandle(a, r) : null);
      out.push('   ' + JSON.stringify(r && r.title !== undefined ? { 标题: r.title, 艺人: r.artist } : String(r).slice(0, 60)));
    }
  }
  return out.join('\\n');
})()`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\archive-view.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/archive-view.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
