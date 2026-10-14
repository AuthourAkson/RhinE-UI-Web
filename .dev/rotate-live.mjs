// 旋转回归：竖屏 → 横屏 → 竖屏 → 横屏，每次都要"刚好装下"（右侧 PREFS/MENU 必须在屏内）
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
const S = (pid, code) => ev(`document.querySelector('iframe[data-id="${pid}"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

// 检查：板子宽 ≤ 屏宽（"刚好装下"）、以及 header 右侧的 prefs/menu 命中区是否在屏内
const check = () => ev(`(function(){
  const s = document.getElementById('stage');
  const r = s.getBoundingClientRect();
  const f = document.querySelector('iframe[data-id="header"]');
  const hr = f.getBoundingClientRect(), w = f.contentWindow;
  const W = w.eval('(function(){ try { return W; } catch(e){ return 0; } })()') || 0;
  const k = W ? hr.width / W : 1;
  const out = { board: Math.round(r.width) + 'x' + Math.round(r.height), vw: innerWidth, vh: innerHeight,
    fitsW: r.width <= innerWidth + 1, fitsH: r.height <= innerHeight + 1, transform: s.style.transform };
  for (const id of ['prefs', 'menu', 'nav']) {
    const h = w.eval('(function(){ try { const a = hits.get("' + id + '"); return a ? JSON.stringify(a) : null; } catch(e){ return null; } })()');
    if (!h) continue;
    const a = JSON.parse(h);
    const x1 = hr.left + a.x * k, x2 = hr.left + (a.x + a.w) * k;
    out[id] = Math.round(x1) + '~' + Math.round(x2) + (x2 <= innerWidth + 1 ? ' ✓' : ' ✗越界');
  }
  return JSON.stringify(out);
})()`);

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const seq = [[390, 844, '竖屏(启动)'], [844, 390, '转横屏'], [390, 844, '转回竖屏'], [844, 390, '再转横屏'], [390, 844, '再回竖屏']];
for (let i = 0; i < seq.length; i++) {
  const [w, h, label] = seq[i];
  if (i === 0) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true });
    await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/?rot=live' });
    await sleep(26000);
    await S('stage', 'send("view","archive"); "ok"'); await sleep(5000);
  } else {
    // 真实旋转：改设备指标后触发 resize（浏览器会派发）
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true, screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });
    await sleep(2500);
  }
  console.log(`【${label} ${w}×${h}】`, await check());
  if (i === 2) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\rotate-portrait-back.png', Buffer.from(s.data, 'base64'));
    console.log('   已存 .dev/rotate-portrait-back.png');
  }
}
console.log('错误:', errs.length, errs.slice(0, 2));
await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
ws.close();

