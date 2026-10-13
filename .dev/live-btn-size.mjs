// 线上验收：宿主按钮与主题按钮尺寸是否一致（手机 + 电脑）
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 120));
  if (m.method === 'Runtime.exceptionThrown') errs.push('[exception] ' + String(m.params.exceptionDetails.text).slice(0, 120));
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
const cmp = () => ev(`(function(){
  const b = document.getElementById('rhine-demo-btn');
  const f = document.querySelector('iframe[data-id="stage"]');
  const r = f.getBoundingClientRect(), w = f.contentWindow;
  const W = w.eval('(function(){ try { return W; } catch(e){ return 0; } })()') || 0;
  const hit = w.eval('(function(){ try { return JSON.stringify(hits.get("ar-addmusic")); } catch(e){ return null; } })()');
  const size = w.eval('(function(){ try { return stSize(AR_ST.btn); } catch(e){ return 0; } })()');
  if (!hit || !b) return 'null';
  const h = JSON.parse(hit), k = W ? r.width / W : 1, cs = getComputedStyle(b), br = b.getBoundingClientRect();
  return JSON.stringify({
    缩放: +k.toFixed(4),
    主题: { h: Math.round(h.h * k), font: +(size * k).toFixed(2) },
    宿主: { h: Math.round(br.height), font: cs.fontSize, pad: cs.padding, inside: br.left >= -1 && br.right <= innerWidth + 1 && br.top >= -1 && br.bottom <= innerHeight + 1 }
  });
})()`);

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/' });
await sleep(7000); await ev('localStorage.clear()'); await send('Page.reload');
await sleep(26000);
await S('send("view","archive"); "ok"'); await sleep(6000);
console.log('【线上手机 844×390】', await cmp());
errs.length = 0;
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/' });
await sleep(26000);
await S('send("view","archive"); "ok"'); await sleep(6000);
console.log('【线上电脑 1707×899】', await cmp());
console.log('控制台错误:', errs.length, errs.slice(0, 2));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
