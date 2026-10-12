// 定位 SETTINGS_FILE 重复声明：分阶段统计（加载后 / 切一次模式后 / 再切一次后）
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
let bucket = [];
const all = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const s = m.params.args.map((a) => a.value !== undefined ? a.value : (a.description || '')).join(' ').slice(0, 260);
    if (/already been declared|Uncaught|SyntaxError|\[paint\]/i.test(s)) { bucket.push(s); all.push(s); }
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const s = String(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')).slice(0, 200);
    bucket.push('[exception] ' + s); all.push('[exception] ' + s);
  }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/?duperr=2' });
await sleep(26000);
console.log('阶段① 加载完成:', bucket.length, '条');
for (const l of bucket.slice(0, 3)) console.log('   ' + l);
bucket = [];

await ev(`window.__RHINE_CMD__("mode:light")`);
await sleep(5000);
console.log('\n阶段② 切 light 后:', bucket.length, '条');
for (const l of bucket.slice(0, 4)) console.log('   ' + l);
bucket = [];

await ev(`window.__RHINE_CMD__("mode:dark")`);
await sleep(4000);
console.log('\n阶段③ 切回 dark 后:', bucket.length, '条');
for (const l of bucket.slice(0, 4)) console.log('   ' + l);

console.log('\n各面板的脚本注入次数（看有没有谁被注了两次）:');
console.log(await ev(`(function(){
  const out = {};
  for (const f of document.querySelectorAll('iframe')) {
    try { out[f.dataset.id] = f.contentWindow.document.querySelectorAll('script').length; } catch (e) { out[f.dataset.id] = 'EXC'; }
  }
  return JSON.stringify(out);
})()`));
console.log('root 面板里的 settings.js 出现次数:', await ev(`(function(){
  const f = document.querySelector('iframe[data-id="root"]');
  try { return [...f.contentWindow.document.querySelectorAll('script')].filter(s => /settings\\.js/.test(s.src)).length; } catch (e) { return 'EXC'; }
})()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();

