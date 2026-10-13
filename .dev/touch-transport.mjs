// 无歧义触摸验收：扫出 transport 面板里的命中区（PLAY / LIGHT·DARK），逐个触摸看主题状态是否变化
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
const S = (pid, code) => ev(`document.querySelector('iframe[data-id="${pid}"]').contentWindow.eval(${JSON.stringify(code)})`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&tr=1' });
await sleep(22000);

// 扫 transport 的命中区网格，收集 id/data 与一个代表点
const scan = await ev(`(function(){
  const f = document.querySelector('iframe[data-id="transport"]');
  const w = f.contentWindow, W = w.eval('(function(){ try { return W; } catch(e){ return 0; } })()');
  const H = w.eval('(function(){ try { return H; } catch(e){ return 0; } })()');
  const r = f.getBoundingClientRect();
  const s = W ? r.width / W : 1;
  const found = {};
  for (let y = 4; y < H - 4; y += 6) for (let x = 4; x < W - 4; x += 6) {
    let a = null;
    try { a = w.eval('(function(){ try { const a = hits.at(' + x + ',' + y + '); return a ? JSON.stringify({id:a.id,data:a.data}) : null; } catch(e){ return null; } })()'); } catch (e) { }
    if (!a) continue;
    const o = JSON.parse(a);
    const key = o.id + '|' + JSON.stringify(o.data);
    if (!found[key]) found[key] = { id: o.id, data: o.data, vx: x, vy: y, px: r.left + x * s, py: r.top + y * s };
  }
  return JSON.stringify({ s: s, ids: Object.keys(found), items: Object.values(found) });
})()`);
const sc = JSON.parse(scan);
console.log('transport 面板的命中区 id:', sc.ids.join('  '));
const items = sc.items.filter((o) => /mode|light|dark|play|pause|order|shuffle|vol/i.test(o.id));
console.log('挑出的可观测目标:', JSON.stringify(items.map((o) => o.id + '(' + Math.round(o.px) + ',' + Math.round(o.py) + ')')));

const doTap = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

// ① LIGHT/DARK 切换
const md = items.find((o) => /mode|light|dark/i.test(o.id));
const beforeMode = await S('stage', 'MODE');
if (md) {
  console.log('\n① 触摸', md.id, '→', Math.round(md.px), Math.round(md.py), ' 触摸前 MODE =', beforeMode);
  await doTap(md.px, md.py); await sleep(3500);
  console.log('   触摸后 MODE =', await S('stage', 'MODE'), (await S('stage', 'MODE')) !== beforeMode ? '**变化 ✓✓**' : '未变 ✗');
}
// ② PLAY
const pl = items.find((o) => /play/i.test(o.id));
if (pl) {
  console.log('\n② 触摸', pl.id, '→', Math.round(pl.px), Math.round(pl.py), ' 触摸前 IsPlaying =', await S('transport', 'fb.IsPlaying'));
  await doTap(pl.px, pl.py); await sleep(4000);
  console.log('   触摸后 IsPlaying =', await S('transport', 'fb.IsPlaying'), ' 时长 =', await S('transport', 'fb.PlaybackLength'));
}
await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
ws.close();
