// 最小探针：加载后直接看各面板状态与报错
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
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);

await ev('location.assign("http://127.0.0.1:8300/?demo=1&probe=1")');
await sleep(17000);
console.log('面板:', await ev(`(function(){
  const out = {};
  for (const f of document.querySelectorAll('iframe')) {
    const r = f.getBoundingClientRect(), st = getComputedStyle(f);
    out[f.dataset.id] = st.display === 'none' ? 'hidden' : Math.round(r.width) + 'x' + Math.round(r.height);
  }
  return JSON.stringify(out);
})()`));
console.log('报错:', await ev('JSON.stringify((window.__ERRORS || []).slice(-6))'));
console.log('面板启动:', await ev('JSON.stringify(window.__PANELS__.map(p => p.__id + (p.__started ? "+" : "-") + (p.__ready ? "R" : "-")))'));
console.log('切视图:', await S('send("view","playlists"); "ok"'));
await sleep(3000);
console.log('之后面板:', await ev(`(function(){
  const out = {};
  for (const f of document.querySelectorAll('iframe')) { const r = f.getBoundingClientRect(), st = getComputedStyle(f); out[f.dataset.id] = st.display === 'none' ? 'hidden' : Math.round(r.width) + 'x' + Math.round(r.height); }
  return JSON.stringify(out);
})()`));
console.log('播放列表内部:', await ev(`(function(){
  const f = document.querySelector('iframe[data-id="playlist"]');
  if (!f) return '没有 iframe';
  const w = f.contentWindow;
  if (!w) return '没有 window';
  let rowCount = -1, err = '';
  try { rowCount = w.document.querySelectorAll('.prow').length; } catch (e) { err = e.message; }
  return JSON.stringify({ 行数: rowCount, body子元素: w.document.body.children.length, 报错: err, STATE: (function(){ try { return w.eval('STATE.view + "/" + (typeof rows !== "undefined" ? rows.length : "no rows")'); } catch (e) { return 'eval ERR ' + e.message; } })() });
})()`));
console.log('最新报错:', await ev('JSON.stringify((window.__ERRORS || []).slice(-8))'));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
