// 用主题自己的 send("preset") 切 LAYOUT（ALBUM ⇄ INDEX），看分组表头
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 120);
  return r.result.value;
};
const P = (code) => ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.eval(${JSON.stringify(code)})`);
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const H = (code) => ev(`document.querySelector('iframe[data-id="head"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');
const dump = () => P(`(function(){
  const out = [];
  for (const el of document.querySelectorAll('.prow')) {
    if (el.style.display === 'none') continue;
    const b = el.getBoundingClientRect();
    out.push((el.classList.contains('group') ? '[组] ' : '     ') + Math.round(b.top) + ' ' + JSON.stringify([...el.children].map(c => (c.textContent || '').trim())));
  }
  return out.join('\\n');
})()`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&lay2=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);
console.log('初始 preset:', await P('STATE.preset'), ' / head:', await H('STATE.preset'));
console.log('\n=== 初始（' + await P('STATE.preset') + '）===');
console.log(await dump());

for (let k = 0; k < 2; k++) {
  await H('send("preset"); "ok"');          // 主题自己的切换：root 面板处理并广播
  await sleep(2000);
  const p = await P('STATE.preset');
  console.log('\n=== 切换后（' + p + '）===');
  console.log('列:', await P('JSON.stringify(Object.keys(COL_FMT))'), ' 当前列数:', await P('(COL_FMT[STATE.preset]||[]).length'));
  console.log(await dump());
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\layout-' + p + '.png', Buffer.from(shot.data, 'base64'));
}
console.log('已存 .dev/layout-album.png / layout-index.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
