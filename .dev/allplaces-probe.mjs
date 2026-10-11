// 逐处验证：ALBUM/INDEX 两种布局的行、底部 NOW PLAYING、右侧卡片
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 90000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 120);
  return r.result.value;
};
const P = (code) => ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.eval(${JSON.stringify(code)})`);
const T = (code) => ev(`document.querySelector('iframe[data-id="transport"]').contentWindow.eval(${JSON.stringify(code)})`);
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&all=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);

for (const layout of ['index', 'album']) {
  console.log('\n=== 布局 ' + layout + ' ===');
  await P(`send("layout","${layout}"); "ok"`);
  await sleep(1800);
  console.log(await P(`(function(){
    const out = [];
    for (const el of document.querySelectorAll('.prow')) {
      if (el.style.display === 'none') continue;
      out.push((el.classList.contains('group') ? '[组] ' : '     ') + JSON.stringify([...el.children].map(c => (c.textContent || '').trim())));
    }
    return out.join('\\n');
  })()`));
}

// 底部正在播放栏：播一首没有标签的
await P(`send("layout","index"); "ok"`);
await sleep(1500);
const rows = JSON.parse(await P(`(function(){
  const out = [];
  for (const el of document.querySelectorAll('.prow')) { if (el.classList.contains('group') || el.style.display === 'none') continue; const b = el.getBoundingClientRect(); out.push({ y: b.top + b.height / 2, t: el.textContent.trim().slice(0, 24) }); }
  return JSON.stringify(out);
})()`));
const pr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="playlist"]').getBoundingClientRect(); return JSON.stringify({ x: r.left + 400, y: r.top }); })()`));
const first = rows.find((r) => /bombinsound/.test(r.t)) || rows[0];
const x = pr.x, y = pr.y + first.y;
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2, buttons: 0 });
await sleep(2500);
console.log('\n=== 底部正在播放栏 ===');
console.log('主题侧 NOW:', await T('JSON.stringify(NOW)'));
console.log('fb.TitleFormat("%title%") =', await T('fb.TitleFormat("%title%").EvalWithMetadb(fb.GetNowPlaying())'));
console.log('宿主侧:', await ev('JSON.stringify({ 播放: window.__RHINE_DEBUG__.SHARED.transport.playing, 标题: window.__RHINE_DEBUG__.SHARED.transport.title || null, 艺人: window.__RHINE_DEBUG__.SHARED.transport.artist || null })'));
console.log('卡片 T.info.title =', await S('T.info ? T.info.title : "?"'), ' 艺人 =', await S('T.info ? T.info.artist : "?"'));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
