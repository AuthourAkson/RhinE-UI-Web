// 收尾：把设置恢复成简体中文，截一张全面板一致的中文界面
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160);
  return r.result.value;
};
const fs = await import('node:fs');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&shot=1")');
await sleep(9000);
// 清掉面板属性里的 uiLang，并把设置文件设成 zh-CN
await ev(`(function(){
  const del = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('uiLang') >= 0 && k.indexOf('rhine:prop:') === 0) del.push(k); }
  del.forEach(k => localStorage.removeItem(k));
  const key = 'rhine:file:audio-archive-settings.json';
  const o = JSON.parse(localStorage.getItem(key) || '{}');
  o.uiLang = 'zh-CN';
  localStorage.setItem(key, JSON.stringify(o, null, 1));
  return 'ok';
})()`);
await send('Page.reload');
await sleep(16000);
const panels = ['header', 'stage', 'transport', 'manager', 'head', 'card'];
const out = {};
for (const p of panels) out[p] = await ev(`(function(){ const f = document.querySelector('iframe[data-id="${p}"]'); if (!f) return '无'; try { return f.contentWindow.eval('UI_LANG'); } catch (e) { return 'EXC'; } })()`);
console.log('各面板 UI_LANG:', JSON.stringify(out));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\zh-consistent.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/zh-consistent.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
