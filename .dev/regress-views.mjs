// 五视图全量回归（dpr=1.5）：每个视图的面板都出图、零报错；档案视图 PLAY ALBUM 仍可用
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 40000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const click = async (x, y, n = 1) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await sleep(40);
  for (let k = 0; k < n; k++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: k + 1, buttons: 1 });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: k + 1, buttons: 0 });
    await sleep(70);
  }
  await sleep(400);
};
const probe = () => ev(`(function(){
  const out = { errors: (window.__ERRORS || []).filter(e => /⚠️|抛错|失败/.test(e)).slice(-3), panels: {} };
  for (const f of document.querySelectorAll('iframe')) {
    const id = f.dataset.id, r = f.getBoundingClientRect(), st = getComputedStyle(f);
    if (st.display === 'none') { out.panels[id] = 'hidden'; continue; }
    let png = 0;
    try { const c = f.contentWindow.document.querySelector('canvas'); png = c.toDataURL().length; } catch (e) { png = -1; }
    out.panels[id] = Math.round(r.width) + 'x' + Math.round(r.height) + ' png=' + png;
  }
  return JSON.stringify(out);
})()`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&reg=1")');
await sleep(17000);

for (const v of ['archive', 'playlists', 'lyrics', 'signal', 'style']) {
  await ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval('send("view","${v}")')`);
  await sleep(2200);
  console.log('视图 ' + v.padEnd(10), await probe());
}

// 回到档案视图，验证 PLAY ALBUM 仍可用（playIndex 语义改过）
await ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval('send("view","archive")')`);
await sleep(2500);
const play = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id="stage"]'), r = f.getBoundingClientRect(), w = f.contentWindow;
  const a = w.eval("hits.get('ar-play')");
  return JSON.stringify(a ? { x: r.left + a.x + a.w / 2, y: r.top + a.y + a.h / 2 } : null);
})()`));
if (play) {
  await click(play.x, play.y);
  await sleep(1200);
  console.log('PLAY ALBUM →', await ev(`JSON.stringify({ playing: window.__RHINE_DEBUG__.SHARED.transport.playing, item: window.__RHINE_DEBUG__.LIB.playing, title: (window.__RHINE_DEBUG__.LIB.tracks[window.__RHINE_DEBUG__.LIB.focusTrack] || {}).title })`));
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
