// 裸 worker 复现：直接给 library-web.js 发索引请求，抓 onerror / 回包
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

const files = await ev('JSON.stringify((window.__RHINE_DEBUG__.LIB.files || []).slice(0, 2))');
console.log('宿主文件表（前 2 条）:', files);

const res = await ev(`(async function(){
  window.__wErr = null; window.__wMsg = null; window.__wProgress = [];
  const w = new Worker('/workers/library-web.js', { type: 'module' });
  w.onerror = (e) => { window.__wErr = (e.message || 'error') + ' @ ' + e.filename + ':' + e.lineno; };
  w.onmessageerror = (e) => { window.__wErr = 'messageerror'; };
  w.onmessage = (e) => { const d = e.data || {}; window.__wProgress.push(d.type + (d.tracks != null ? ':' + d.tracks : '')); if (d.type === 'catalog') window.__wMsg = JSON.stringify({ type: d.type, tracks: d.tracks, albums: (d.albums || []).length, items: (d.items || []).length }).slice(0, 200); if (d.type === 'log') window.__wProgress.push('LOG ' + String(d.msg || '').slice(0, 120)); };
  w.postMessage({ cmd: 'index', gen: 99, files: (window.__RHINE_DEBUG__.LIB.files || []) });
  await new Promise((r) => setTimeout(r, 6000));
  return JSON.stringify({ 错误: window.__wErr, catalog: window.__wMsg, 消息序列: window.__wProgress.slice(0, 12) });
})()`);
console.log('裸 worker 结果:', res);
ws.close();
