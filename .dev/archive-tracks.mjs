// 档案视图 SHOW=TRACKS：每首曲子一个盒子，看盒子上印的名称
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
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&tracks=1")');
await sleep(17000);
await S('send("view","archive"); "ok"');
await sleep(2500);
// 主题的 SHOW 开关：ALBUMS ⇄ TRACKS（stage 面板里点）
console.log('切换 SHOW:', await S(`(function(){ if (typeof toggleShow === "function") { toggleShow(); return "toggleShow()"; } if (typeof send === "function") { send("show"); return "send(show)"; } return "找不到切换函数"; })()`));
await sleep(3000);
console.log('当前模式:', await S(`(function(){ try { return JSON.stringify({ show: typeof SHOW !== "undefined" ? SHOW : null, state: typeof STATE !== "undefined" ? STATE.show : null }); } catch (e) { return "?"; } })()`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\archive-tracks.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/archive-tracks.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
