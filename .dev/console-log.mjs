// 订阅页面控制台 + 异常（含 worker 的错误），用于排查 worker 不工作的问题
// 用法: node .dev/console-log.mjs [url] [seconds] [port]
const [, , url = 'http://127.0.0.1:8300/?demo=1', secs = '20', port = '9226'] = process.argv;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const args = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    console.log(`  [${m.params.type}] ${args.slice(0, 400)}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console.log(`  [异常] ${d.text} ${d.exception ? d.exception.description : ''}`.slice(0, 600));
  } else if (m.method === 'Log.entryAdded') {
    const e2 = m.params.entry;
    console.log(`  [log:${e2.level}] ${e2.text}`.slice(0, 400));
  }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout')); } }, 20000); });

await send('Runtime.enable');
await send('Log.enable');
console.log(`打开 ${url}，监听 ${secs}s 控制台…`);
await send('Page.enable');
await send('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + 't=' + Date.now() });
await new Promise((r) => setTimeout(r, Number(secs) * 1000));
ws.close();
