// 验证：① 内联模块 worker 能否工作 ② /workers/*.js 的 HTTP 状态与大小
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

console.log('① 内联模块 worker:', await ev(`(async function(){
  try {
    const url = URL.createObjectURL(new Blob(['self.onmessage = (e) => self.postMessage({ ok: e.data + 1 });'], { type: 'text/javascript' }));
    const w = new Worker(url, { type: 'module' });
    const out = await new Promise((res) => { w.onmessage = (e) => res('收到 ' + JSON.stringify(e.data)); w.onerror = (e) => res('错误 ' + e.message); w.postMessage(41); setTimeout(() => res('超时无响应'), 4000); });
    w.terminate(); URL.revokeObjectURL(url);
    return out;
  } catch (e) { return 'EXC ' + e.message; }
})()`));

console.log('② /workers/library-web.js:', await ev(`(async function(){
  try { const r = await fetch('/workers/library-web.js'); const t = await r.text(); return r.status + ' ' + r.headers.get('content-type') + ' ' + t.length + ' 字节, 含 onmessage=' + t.includes('self.onmessage'); } catch (e) { return 'EXC ' + e.message; }
})()`));
console.log('③ /workers/tags.js:', await ev(`(async function(){
  try { const r = await fetch('/workers/tags.js'); const t = await r.text(); return r.status + ' ' + r.headers.get('content-type') + ' ' + t.length + ' 字节, 含 parseTags=' + t.includes('parseTags'); } catch (e) { return 'EXC ' + e.message; }
})()`));

console.log('④ 直接 new Worker(真实文件) 并等待 3 秒:', await ev(`(async function(){
  const log = [];
  const ow = console.warn, oc = console.log;
  try {
    const w = new Worker('/workers/library-web.js', { type: 'module' });
    w.onerror = (e) => log.push('onerror: ' + (e.message || '?') + ' @ ' + (e.filename || '?') + ':' + (e.lineno || '?'));
    w.onmessageerror = () => log.push('onmessageerror');
    w.onmessage = (e) => log.push('onmessage: ' + JSON.stringify(e.data).slice(0, 120));
    w.postMessage({ cmd: 'index', gen: 7, files: [{ path: 'C:\\\\Music\\\\x.mp3', url: '/.dev/music/No Tags Here/unnamed.mp3', size: 32644 }] });
    await new Promise((r) => setTimeout(r, 3000));
    w.terminate();
  } catch (e) { log.push('throw: ' + e.message); }
  return log.join(' | ') || '（什么都没有：既无响应也无错误）';
})()`));
ws.close();
