// 线上验收：demo 按钮 → 载入内置曲库 → 播放二创曲 → Range 拖动 → 同名 lrc
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const audioReqs = [];
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.responseReceived' && /musiclab/.test(m.params.response.url)) {
    audioReqs.push({ s: m.params.response.status, cr: m.params.response.headers['content-range'] || '', ar: m.params.response.headers['accept-ranges'] || '', url: decodeURIComponent(m.params.response.url.split('/').pop()).slice(0, 26) });
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(String((m.params.args[0] && m.params.args[0].value) || '').slice(0, 140));
  if (m.method === 'Runtime.exceptionThrown') errs.push(String(m.params.exceptionDetails.text).slice(0, 140));
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

await send('Network.enable'); await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/' });
await sleep(30000);

console.log('demo 按钮:', await ev(`(function(){ const b = document.getElementById('rhine-demo-btn'); if (!b) return '（无）'; const r = b.getBoundingClientRect(); return JSON.stringify({ 文案: b.textContent, display: getComputedStyle(b).display, 位置: Math.round(r.left)+','+Math.round(r.top) }); })()`));
const r = JSON.parse(await ev(`(function(){ const b = document.getElementById('rhine-demo-btn'); const q = b.getBoundingClientRect(); return JSON.stringify({ x: q.left + q.width/2, y: q.top + q.height/2 }); })()`));
console.log('\n点击 demo 按钮…');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none', buttons: 0 }); await sleep(200);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
await sleep(10000);
console.log('宿主曲库:', await ev(`JSON.stringify({ source: window.__RHINE_DEBUG__.LIB.source, files: window.__RHINE_DEBUG__.LIB.files.length, tracks: window.__RHINE_DEBUG__.LIB.tracks.length })`));
console.log('状态行:', await ev(`document.getElementById('log').textContent`));
console.log('主题侧:', await S(`JSON.stringify({ live: LIB.live, tracks: LIB.tracks.length, albums: LIB.albums.length })`));

const idx = await ev(`window.__RHINE_DEBUG__.LIB.tracks.findIndex(t => /迷迭香/.test(String(t.path||'')))`);
console.log('\n二创曲目下标:', idx, '路径:', await ev(`(window.__RHINE_DEBUG__.LIB.tracks[${idx}]||{}).path`));
console.log('同名 .lrc 是否被识别:', await S(`(function(){
  const p = ${JSON.stringify('D:\\musiclab\\迷迭香-world.execute (me) ;-Mili.lrc')};
  return JSON.stringify({ 推导路径: p, IsFile: utils.IsFile(p), 字节数: utils.ReadTextFile(p).length, 首行: (utils.ReadTextFile(p).split('\\n')[0] || '') });
})()`));
if (idx >= 0) {
  await ev(`window.__RHINE_DEBUG__.playIndex(${idx})`);
  await sleep(7000);
  const before = await ev(`+window.__RHINE_DEBUG__.audio.currentTime.toFixed(2)`);
  await ev(`window.__RHINE_DEBUG__.audio.currentTime = 60`);
  await sleep(3000);
  const after = await ev(`+window.__RHINE_DEBUG__.audio.currentTime.toFixed(2)`);
  console.log(`\n拖动进度条：${before}s → 设 60s → 实际 ${after}s  ${after > 55 ? '✓ Range 生效' : '✗ 跳回开头'}`);
  console.log('音频响应：');
  for (const a of audioReqs.slice(-6)) console.log('   ', JSON.stringify(a));
  await S('send("view","lyrics"); "ok"');
  await sleep(6000);
  console.log('歌词模块状态:', await S(`JSON.stringify({ state: LYR.state })`));
}
console.log('\n控制台错误:', errs.length, errs.slice(0, 3));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\live-demo.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/live-demo.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
