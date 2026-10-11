// 查播放列表面板为什么 0 行
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 60000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const P = (code) => ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.eval(${JSON.stringify(code)})`);

console.log('PL:', await P('PL'));
console.log('ActivePlaylist:', await P('plman.ActivePlaylist'));
console.log('PlaylistCount:', await P('plman.PlaylistCount'));
console.log('库里的播放列表:', await ev('JSON.stringify(window.__RHINE_DEBUG__.LIB.playlists.map(p => ({ n: p.name, c: p.items.length })))'));
console.log('plItems(0) 调用:', await P(`(function(){ try { const it = plItems(0); return 'Count=' + it.Count + ' Item0=' + (it.Item(0) ? 'OK' : 'null'); } catch (e) { return 'ERR ' + e.message; } })()`));
console.log('buildRows 调用:', await P(`(function(){ try { PL = plman.ActivePlaylist; buildRows(); return 'rows=' + rows.length; } catch (e) { return 'ERR ' + e.message + ' | ' + (e.stack||'').split('\\n')[1]; } })()`));
console.log('再渲染:', await P(`(function(){ try { render(); return 'pool=' + pool.length + ' 可见=' + [...document.querySelectorAll('.prow')].filter(r => r.style.display !== 'none').length; } catch (e) { return 'ERR ' + e.message; } })()`));
console.log('GetPlaylistItems 句柄:', await P(`(function(){ try { const it = plman.GetPlaylistItems(0); const h = it.Item(0); return JSON.stringify({ count: it.Count, id: h && h.__id, path: h && h.Path, hasFileInfo: !!(h && h.GetFileInfo) }); } catch (e) { return 'ERR ' + e.message; } })()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
