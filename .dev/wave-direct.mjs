// 直接验证 GetWaveformAsync 的实现（单会话，不依赖 same 分支）
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

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&wave2=1")');
await sleep(16000);

console.log('面板里的 trackAt(3).url:', await S('(function(){ const t = (window.__RHINE_LIBRARY__.tracks[3]); return t ? String(t.url) : "no"; })()'));
console.log('\n① 直接 await GetWaveformAsync（1024 点，与主题一致）:');
console.log('  ', await S(`(async function(){
  try {
    const hh = fb.GetNowPlaying() || fb.GetFocusItem();
    if (!hh) return 'handle 是 null';
    const t0 = Date.now();
    let calls = 0, firstAt = 0;
    const r = await utils.GetWaveformAsync(hh, 1024, 0, 0, (v, s) => { if (!calls) firstAt = Date.now() - t0; calls++; return true; });
    const mx = Math.max.apply(null, Array.from(r));
    const nz = Array.from(r).filter(v => v > 0.001).length;
    return 'ok 长度=' + r.length + ' 峰值=' + mx.toFixed(4) + ' 非零桶=' + nz + ' 回调次数=' + calls + ' 首个回调=' + firstAt + 'ms 总耗时=' + (Date.now() - t0) + 'ms';
  } catch (e) { return 'ERR ' + (e && (e.message || e)); }
})()`));

console.log('\n② 走主题的 waveLoad（含缓存写入）:');
console.log('  调用前:', await S('JSON.stringify({ key: Wave.key, loaded: Wave.loaded })'));
console.log('  ', await S('(function(){ waveLoad(fb.GetNowPlaying() || fb.GetFocusItem(), () => {}); return "called"; })()'));
await sleep(2500);
console.log('  调用后:', await S('JSON.stringify({ key: Wave.key, loaded: Wave.loaded, max: Wave.peaks ? +Math.max.apply(null, Array.from(Wave.peaks)).toFixed(3) : 0 })'));
console.log('  缓存命中（再调一次应当立刻读到缓存）:');
await S('Wave.key = ""; waveLoad(fb.GetNowPlaying() || fb.GetFocusItem(), () => {}); "again"');
console.log('  ', await S('JSON.stringify({ key: Wave.key, loaded: Wave.loaded })'));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
