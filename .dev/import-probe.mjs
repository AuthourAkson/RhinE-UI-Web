// 用诊断 worker 验证相对 import
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 60000); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

console.log('① 诊断 worker（相对 import ./tags.js）:', await ev(`(async function(){
  const log = [];
  try {
    const w = new Worker('/workers/_probe-worker.js', { type: 'module' });
    w.onerror = (e) => log.push('onerror: ' + (e.message || '?'));
    w.onmessage = (e) => log.push('onmessage: ' + JSON.stringify(e.data).slice(0, 200));
    await new Promise((r) => setTimeout(r, 5000));
    w.terminate();
  } catch (e) { log.push('throw: ' + e.message); }
  return log.join(' | ') || '（无响应、无错误）';
})()`));

console.log('② 诊断 worker（绝对路径 import）:', await ev(`(async function(){
  const log = [];
  try {
    const src = 'const m = await import("/workers/tags.js"); self.postMessage({ ok: Object.keys(m).join(",") });';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url, { type: 'module' });
    w.onerror = (e) => log.push('onerror: ' + (e.message || '?'));
    w.onmessage = (e) => log.push('onmessage: ' + JSON.stringify(e.data).slice(0, 200));
    await new Promise((r) => setTimeout(r, 5000));
    w.terminate(); URL.revokeObjectURL(url);
  } catch (e) { log.push('throw: ' + e.message); }
  return log.join(' | ') || '（无响应、无错误）';
})()`));
ws.close();
