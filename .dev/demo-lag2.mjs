// 谁在慢？切回档案视图后，分别测「主题自己的 ADD 命中区出现时刻」与「demo 按钮出现时刻」
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
// 一次往返同时取两个状态，减少测量噪声
const both = () => ev(`(function(){
  const b = document.getElementById('rhine-demo-btn');
  const f = document.querySelector('iframe[data-id="stage"]');
  let hit = false;
  try { hit = !!f.contentWindow.eval('(function(){ try { return hits.get("ar-addmusic"); } catch(e){ return null; } })()'); } catch (e) { }
  return JSON.stringify({ hit: hit, btn: b ? getComputedStyle(b).display : 'none', view: (function(){ try { return f.contentWindow.eval('STATE.view'); } catch(e){ return '?'; } })() });
})()`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?lag2=1' });
await sleep(22000);
console.log('初始:', await both());

console.log('\n切到播放列表…');
await S('send("view","playlists"); "ok"');
for (let i = 0; i < 40; i++) { const s = JSON.parse(await both()); if (!s.hit && s.btn === 'none') { console.log('  ' + (i * 20) + 'ms  ' + JSON.stringify(s)); break; } await sleep(20); }

console.log('\n切回档案视图，每 20ms 记录一次（看谁先到）…');
const t0 = Date.now();
await S('send("view","archive"); "ok"');
let hitAt = -1, btnAt = -1;
for (let i = 0; i < 60; i++) {
  const s = JSON.parse(await both());
  if (hitAt < 0 && s.hit) hitAt = Date.now() - t0;
  if (btnAt < 0 && s.btn === 'block') btnAt = Date.now() - t0;
  if (hitAt >= 0 && btnAt >= 0) break;
  await sleep(20);
}
console.log('  主题 ar-addmusic 命中区出现:', hitAt >= 0 ? hitAt + ' ms' : '未出现');
console.log('  demo 按钮出现:', btnAt >= 0 ? btnAt + ' ms' : '未出现');
console.log('  → 两者差值（越小越跟手）:', hitAt >= 0 && btnAt >= 0 ? (btnAt - hitAt) + ' ms' : '?');
console.log('\n宿主侧调试计数:', await ev(`JSON.stringify(window.__DEMO_DEBUG__ || null)`));
// 再切一次，逐次记录 why，看清到底卡在哪一步
await S('send("view","playlists"); "ok"'); await sleep(900);
console.log('\n第二次切回，记录每次 updateDemoBtn 的退出原因:');
await ev(`(function(){
  window.__DEMO_DEBUG__.trace = [];
  const f = updateDemoBtn;
  window.updateDemoBtn = function () {
    const r = f.apply(this, arguments);
    try {
      const s = document.querySelector('iframe[data-id="stage"]');
      window.__DEMO_DEBUG__.trace.push([Math.round(performance.now()), window.__DEMO_DEBUG__.why, (function(){ try { return s.contentWindow.eval('STATE.view'); } catch (e) { return '?'; } })()]);
    } catch (e) { }
    return r;
  };
  return 'hooked';
})()`);
await S('send("view","archive"); "ok"');
await sleep(1600);
console.log(await ev(`JSON.stringify((window.__DEMO_DEBUG__.trace || []).slice(0, 14))`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
