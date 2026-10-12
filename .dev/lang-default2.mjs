// 清空 localStorage（模拟全新访客）后，验证默认语言是否为英文
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const H = (code) => ev(`document.querySelector('iframe[data-id="header"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?clear=1' });
await sleep(4000);
console.log('清空 localStorage（模拟全新访客）…');
await ev('localStorage.clear()');
console.log('清单里的默认设置是否已含 uiLang:', await ev(`(async () => {
  const m = await (await fetch('/__manifest.json')).json();
  const t = m.text['audio-archive-settings.json'] || '（没有这个文件）';
  return t.replace(/\\s+/g, ' ').slice(0, 90);
})()`));
await send('Page.reload');
await sleep(24000);
console.log('\n主题 UI_LANG:', await H('(typeof UI_LANG !== "undefined" ? UI_LANG : "?")'));
console.log('主题读到的 uiLang:', await H(`(function(){ try { return String(getSetting('uiLang','（缺省）')); } catch(e){ return 'EXC'; } })()`));
console.log('HUD 按钮:', await ev(`(document.getElementById('pick-btn')||{}).textContent + ' / ' + (document.getElementById('hide-btn')||{}).textContent`));
console.log('导航标签（英文应为 ARCHIVE/PLAYLISTS/…）:', await H(`(function(){ try { return VIEWS.map(function(v){ return tr(v); }).join(' · '); } catch(e){ return 'EXC ' + e.message; } })()`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\default-en.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/default-en.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
