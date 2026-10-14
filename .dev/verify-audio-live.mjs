// 功能性验收：改过 Range 分支后，线上音频必须还能正常播放
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 140));
  if (m.method === 'Runtime.exceptionThrown') errs.push('[exception] ' + String(m.params.exceptionDetails.text).slice(0, 140));
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="transport"]').contentWindow.eval(${JSON.stringify(code)})`);

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/' });
await sleep(7000);
await ev('localStorage.clear()');
await send('Page.reload');
await sleep(26000);
let ok = false;
for (let i = 0; i < 25; i++) { ok = (await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); return b && getComputedStyle(b).display==='block'; })()`)) === true; if (ok) break; await sleep(1000); }
console.log('demo 按钮可见:', ok);
if (ok) {
  const r = JSON.parse(await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.left+q.width/2,y:q.top+q.height/2}); })()`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none', buttons: 0 }); await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(9000);
  console.log('曲库文件数:', await ev(`window.__RHINE_DEBUG__.LIB.files.length`));
  await ev(`window.__RHINE_DEBUG__.playIndex(0)`);
  await sleep(9000);
  const t1 = await S('fb.PlaybackTime'), len = await S('fb.PlaybackLength');
  await sleep(4000);
  const t2 = await S('fb.PlaybackTime');
  console.log(`播放中=${await S('fb.IsPlaying')}  曲长=${len ? len.toFixed(1) + 's' : len}  时间 ${t1 ? t1.toFixed(2) : t1} → ${t2 ? t2.toFixed(2) : t2}  ${t2 > t1 ? '**在走 ✓ 音频正常**' : '时间没走 ✗'}`);
  // Range 是否真的被用了（音频元素）
  console.log('media 元素状态:', await ev(`(function(){
    const a = [...document.querySelectorAll('audio')].map(x => ({ src: (x.currentSrc||'').slice(-28), ready: x.readyState, dur: +(x.duration||0).toFixed(1), err: x.error ? x.error.code : null, seeking: x.seeking }));
    return JSON.stringify(a.slice(0, 3));
  })()`));
}
console.log('控制台错误:', errs.length, errs.slice(0, 3));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
