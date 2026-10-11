// 在干净页面上测 worker：① 直接建 library-web worker ② 用探针 import 它
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

await ev('location.assign("http://127.0.0.1:8300/panel.html")');   // 干净的同源页面
await sleep(2000);
console.log('页面:', await ev('location.pathname'));

console.log('\n① 探针 worker（import ./library-web.js）:', await ev(`(async function(){
  const log = [];
  const w = new Worker('/workers/_probe2.js', { type: 'module' });
  w.onerror = (e) => log.push('onerror: ' + (e.message || '?') + ' @' + (e.lineno || '?'));
  w.onmessage = (e) => log.push(JSON.stringify(e.data));
  await new Promise((r) => setTimeout(r, 8000));
  w.terminate();
  return log.join('  |  ') || '（无响应、无错误）';
})()`));

console.log('\n② 直接 library-web worker + 索引请求:', await ev(`(async function(){
  const log = [];
  const w = new Worker('/workers/library-web.js', { type: 'module' });
  w.onerror = (e) => log.push('onerror: ' + (e.message || '?') + ' @' + (e.lineno || '?'));
  w.onmessage = (e) => log.push('msg: ' + JSON.stringify(e.data).slice(0, 160));
  w.postMessage({ cmd: 'index', gen: 5, files: [{ path: 'C:\\\\Music\\\\No Tags Here\\\\unnamed.mp3', url: '/.dev/music/No%20Tags%20Here/unnamed.mp3', size: 32644 }] });
  await new Promise((r) => setTimeout(r, 8000));
  w.terminate();
  return log.join('  |  ') || '（无响应、无错误）';
})()`));
ws.close();
