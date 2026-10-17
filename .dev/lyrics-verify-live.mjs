// 歌词翻译端到端验收：播放 Mili 那首 → 进歌词视图 → 检查主题内部状态有没有译文行
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
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 240000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200) : r.result.value; };
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/?demo=1&lyrlive=1' });
await sleep(22000);
// 载入内置曲库
let ok = false;
for (let i = 0; i < 25; i++) { ok = (await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); return b && getComputedStyle(b).display==='block'; })()`)) === true; if (ok) break; await sleep(1000); }
if (ok) {
  const r = JSON.parse(await ev(`(function(){ const b=document.getElementById('rhine-demo-btn'); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.left+q.width/2,y:q.top+q.height/2}); })()`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none', buttons: 0 }); await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(9000);
}
console.log('曲库文件数:', await ev(`window.__RHINE_DEBUG__.LIB.files.length`));
await ev(`window.__RHINE_DEBUG__.playIndex(0)`);
await sleep(10000);
console.log('播放:', await S('fb.IsPlaying'), ' 曲长:', await S('fb.PlaybackLength'), ' 当前曲目:', String(await S('fb.Title')).slice(0, 40));
await S('send("view","lyrics"); "ok"');
await sleep(20000);   // 留出网易云两次请求 + 解析的时间
console.log('\n=== 主题歌词/翻译内部状态 ===');
console.log(await S(`(function(){
  try {
    const out = { tr: (typeof TR !== 'undefined') ? TR.state : 'TR 不存在', t: typeof T !== 'undefined' ? Object.keys(T) : 'T 不存在' };
    if (typeof T !== 'undefined' && T.lyrics) {
      out.lines = T.lyrics.lines.length;
      out.first = T.lyrics.lines.slice(0, 5).map(function (l) { return l.t + ' | ' + String(l.a).slice(0,28) + ' | ' + String(l.b).slice(0,28); }); out.withB = T.lyrics.lines.filter(function(l){return l.b;}).length;
    }
    return JSON.stringify(out, null, 1);
  } catch (e) { return 'EXC ' + e.message; }
})()`));
console.log('\n=== 缓存文件（主题会把翻译缓存到 profile）===');
console.log(await ev(`(function(){ try { const ks = Object.keys(localStorage).filter(k => /audio-archive-cache/i.test(k)); return ks.length + ' 个: ' + ks.slice(0,4).join(' '); } catch(e){ return 'EXC'; } })()`));
console.log('\n控制台错误:', errs.length, errs.slice(0, 3));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();


