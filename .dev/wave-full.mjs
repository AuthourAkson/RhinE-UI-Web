// 完整链路验证（单会话）：播放 → 直调 GetWaveformAsync（报告错误）→ 主题 waveLoad → signal 截图
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
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');
const dbl = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); await sleep(50);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }); await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2, buttons: 0 }); await sleep(700);
};
// 订阅控制台，把主题的 catch 日志抓回来
const logs = [];
await send('Runtime.enable');
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled') {
    const t = (m.params.args || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
    if (/waveform|audio|解码|decode/i.test(t)) logs.push(t);
  }
});

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&wave3=1")');
await sleep(16000);

await S('send("view","playlists"); "ok"');
let rows = [];
for (let i = 0; i < 20 && rows.length < 2; i++) {
  await sleep(800);
  const raw = await ev(`(function(){
    const f = document.querySelector('iframe[data-id="playlist"]');
    if (!f) return '[]';
    const w = f.contentWindow;
    if (!w || !w.document.querySelector('.prow')) return '[]';
    const r = f.getBoundingClientRect(), out = [];
    for (const el of w.document.querySelectorAll('.prow')) { if (el.classList.contains('group')) continue; const b = el.getBoundingClientRect(); if (b.height < 1) continue; out.push({ x: Math.round(r.left + b.left + 120), y: Math.round(r.top + b.top + b.height / 2), t: el.textContent.trim().slice(0, 18) }); }
    return JSON.stringify(out);
  })()`);
  try { rows = JSON.parse(raw); } catch (e) { rows = []; }
}
if (rows.length < 2) { console.log('没拿到播放列表行，放弃：', rows); ws.close(); process.exit(1); }
console.log('双击第二行:', rows[1].t);
await dbl(rows[1].x, rows[1].y);
await sleep(1200);
console.log('播放:', await ev('JSON.stringify(window.__RHINE_DEBUG__.SHARED.transport.playing)'), '现在播放:', await S('(function(){ const h = fb.GetNowPlaying(); return h ? h.Path : "null"; })()'));

console.log('\n① 直调 GetWaveformAsync（报告错误）:');
console.log('  ', await S(`(async function(){
  try {
    const hh = fb.GetNowPlaying();
    if (!hh) return 'handle null';
    const t0 = Date.now();
    let calls = 0;
    const r = await utils.GetWaveformAsync(hh, 256, 0, 0, () => { calls++; return true; });
    return 'ok 长度=' + r.length + ' 峰值=' + Math.max.apply(null, Array.from(r)).toFixed(4) + ' 回调=' + calls + ' 耗时=' + (Date.now() - t0) + 'ms';
  } catch (e) { return 'ERR ' + (e && (e.message || e)); }
})()`));
await sleep(1500);
console.log('  主题那条链:', await S('JSON.stringify({ key: Wave.key, loaded: Wave.loaded, max: Wave.peaks ? +Math.max.apply(null, Array.from(Wave.peaks)).toFixed(3) : 0 })'));
if (logs.length) console.log('  控制台相关日志:', logs.slice(-5));

await S('send("view","signal"); "ok"');
await sleep(3000);
console.log('\n② signal 状态:', await S('JSON.stringify({ live: AUDIO.live, energy: +AUDIO.energy.toFixed(3), waveKey: Wave.key, loaded: Wave.loaded })'));
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\' + n, Buffer.from(s.data, 'base64')); };
await shot('signal-ok-1.png'); await sleep(1500); await shot('signal-ok-2.png');
console.log('已存 signal-ok-1.png / signal-ok-2.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
