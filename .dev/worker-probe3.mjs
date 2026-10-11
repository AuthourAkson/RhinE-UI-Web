// 延迟 postMessage + 调试回包，判定消息是否到达 worker
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

await ev('location.assign("http://127.0.0.1:8300/panel.html")');
await sleep(2000);
console.log(await ev(`(async function(){
  const log = [];
  const w = new Worker('/workers/library-web.js', { type: 'module' });
  w.onerror = (e) => log.push('onerror: ' + (e.message || '?') + ' @' + (e.lineno || '?'));
  w.onmessage = (e) => log.push('msg: ' + JSON.stringify(e.data).slice(0, 160));
  await new Promise((r) => setTimeout(r, 1200));               // 等模块求值完再发
  w.postMessage({ cmd: 'index', gen: 5, files: [{ path: 'C:\\\\Music\\\\No Tags Here\\\\unnamed.mp3', url: '/.dev/music/No%20Tags%20Here/unnamed.mp3', size: 32644 }] });
  await new Promise((r) => setTimeout(r, 6000));
  w.terminate();
  return log.join('  |  ') || '（无响应、无错误）';
})()`));
ws.close();
