// 验证宿主按钮与主题按钮"同尺寸"：读计算样式 + 裁图目视对比
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
const fs = await import('node:fs');

const report = async (label) => {
  const info = await ev(`(function(){
    const b = document.getElementById('rhine-demo-btn');
    const f = document.querySelector('iframe[data-id="stage"]');
    const r = f.getBoundingClientRect();
    const w = f.contentWindow;
    const W = w.eval('(function(){ try { return W; } catch(e){ return 0; } })()') || 0;
    const hit = w.eval('(function(){ try { return JSON.stringify(hits.get("ar-addmusic")); } catch(e){ return null; } })()');
    const size = w.eval('(function(){ try { return stSize(AR_ST.btn); } catch(e){ return 0; } })()');
    const cs = getComputedStyle(b);
    const br = b.getBoundingClientRect();
    const msc = W ? r.width / W : 1;
    const h = hit ? JSON.parse(hit) : null;
    return JSON.stringify({
      缩放: +msc.toFixed(4),
      宿主按钮: { w: Math.round(br.width), h: Math.round(br.height), fontSize: cs.fontSize, padding: cs.padding, top: Math.round(br.top), left: Math.round(br.left) },
      主题按钮_虚拟: h ? { w: h.w, h: h.h, size: size } : null,
      主题按钮_实际: h ? { w: Math.round(h.w * msc), h: Math.round(h.h * msc), fontSize: +(size * msc).toFixed(2) } : null,
      主题按钮_屏幕位置: h ? { x: Math.round(r.left + h.x * msc), y: Math.round(r.top + h.y * msc) } : null,
    });
  })()`);
  console.log(`【${label}】`, info);
  return JSON.parse(info);
};

await send('Runtime.enable'); await send('Page.enable');

// —— 手机
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?empty=1&size=1' });
await sleep(26000);
await S('send("view","archive"); "ok"'); await sleep(6000);
const mob = await report('手机 844×390');
const th = mob.主题按钮_屏幕位置, hb = mob.宿主按钮;
if (th) {
  const x = Math.max(0, th.x - 12), y = Math.max(0, th.y - 10), w = Math.min(844 - x, 320), h = Math.min(390 - y, (hb.top + hb.h) - y + 14);
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 3 } });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\btn-size-mobile.png', Buffer.from(s.data, 'base64'));
  console.log('  已裁图 .dev/btn-size-mobile.png（上=主题按钮，下=宿主按钮）');
}
console.log('  手机端错误:', errs.length);

// —— 电脑（必须仍是原样：40 高 / 13px / padding 18）
errs.length = 0;
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?empty=1&size=2' });
await sleep(26000);
await S('send("view","archive"); "ok"'); await sleep(6000);
await report('电脑 1707×899');
console.log('  电脑端错误:', errs.length);
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
