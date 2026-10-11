// 看设置文件与各面板属性里到底存了什么
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

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&store=1")');
await sleep(17000);

console.log('=== 所有 rhine:file: 里含 settings 的键 ===');
console.log(await ev(`(function(){
  const out = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('settings') >= 0) out.push(k + ' → ' + (localStorage.getItem(k) || '').slice(0, 260)); }
  return out.join('\\n---\\n') || '(无)';
})()`));
console.log('\n=== 所有 rhine:prop: 里含 uiLang 的键 ===');
console.log(await ev(`(function(){
  const out = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('uiLang') >= 0) out.push(k + ' = ' + localStorage.getItem(k)); }
  return out.join('\\n') || '(无)';
})()`));
console.log('\n=== 设置文件里有没有 uiLang ===');
console.log(await ev(`(function(){
  try { const s = localStorage.getItem('rhine:file:audio-archive-settings.json'); if (!s) return 'localStorage 里没有这份文件（用的是仓库里的默认文件）';
    const o = JSON.parse(s); return '有 uiLang: ' + JSON.stringify(o.uiLang) + '    全部键: ' + Object.keys(o).join(','); } catch (e) { return 'ERR ' + e.message; }
})()`));
console.log('\n=== 仓库默认设置文件里的 uiLang ===');
console.log(await ev(`(function(){ try { const r = window.__RHINE_DEBUG__ && window.__RHINE_DEBUG__.MANIFEST; const t = (window.__RHINE_MANIFEST__ && window.__RHINE_MANIFEST__.text) || null; return t ? String(t['audio-archive-settings.json'] || '').slice(0, 120) : '拿不到 manifest'; } catch (e) { return 'ERR ' + e.message; } })()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
