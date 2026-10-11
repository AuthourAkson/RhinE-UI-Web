// 搜索后播放列表面板的内部状态：rows / pool / 可见行 / PL
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
const H = (code) => ev(`document.querySelector('iframe[data-id="header"]').contentWindow.eval(${JSON.stringify(code)})`);
const P = (code) => ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.eval(${JSON.stringify(code)})`);
const dump = () => P(`JSON.stringify({
  PL: PL,
  活动列表_宿主: (window.__RHINE_SHARED__ || {}).transport ? 'n/a' : 'n/a',
  rows数: rows.length,
  rows非组: rows.filter(r => !r.group).length,
  pool数: pool.length,
  可见行: [...document.querySelectorAll('.prow')].filter(e => e.style.display !== 'none').length,
  行内容: [...document.querySelectorAll('.prow')].filter(e => e.style.display !== 'none').map(e => [...e.children].map(c => (c.textContent||'').trim()).join('|')),
})`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&pl=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);
console.log('搜索前:', await dump());

for (const q of ['world', 'bomb', 'zzzznotfound', 'world']) {
  await H(`(function(){ search.text = ${JSON.stringify(q)}; applySearch(); return 'ok'; })()`);
  await sleep(3000);
  console.log('\n搜 "' + q + '" →');
  console.log('  宿主列表:', await ev('JSON.stringify(window.__RHINE_DEBUG__.LIB.playlists.map(p => p.name + "(" + p.items.length + ")"),)') , ' 活动:', await ev('window.__RHINE_DEBUG__.LIB.activePlaylist'));
  console.log('  面板:', await dump());
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
