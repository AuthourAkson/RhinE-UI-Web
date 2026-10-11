// 抓控制台：看库 worker 那条链（索引请求 / catalog / 报错）
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const t = (m.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ');
    logs.push(m.params.type + ': ' + t);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 60000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await send('Runtime.enable');
await send('Log.enable');
logs.length = 0;
await ev('location.assign("http://127.0.0.1:8300/?demo=1&logs=1")');
await sleep(18000);
console.log('=== 库相关日志 ===');
for (const l of logs.filter((x) => /库|worker|index|catalog|Worker|错误|ERROR|Error/.test(x))) console.log('  ' + l.slice(0, 300));
console.log('\n=== 全部异常 ===');
for (const l of logs.filter((x) => x.startsWith('EXC'))) console.log('  ' + l.slice(0, 400));
console.log('\n=== 最后 8 条 ===');
for (const l of logs.slice(-8)) console.log('  ' + l.slice(0, 200));
ws.close();
