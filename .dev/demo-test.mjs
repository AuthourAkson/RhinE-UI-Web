// 验证：静态站（dist）里 demo 按钮出现 → 点击载入内置曲库 → 播放 → 拖动进度条（Range）
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const audios = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.responseReceived' && /musiclab/.test(m.params.response.url)) {
    audios.push({ url: m.params.response.url.split('/').pop().slice(0, 28), status: m.params.response.status, range: m.params.response.headers['content-range'] || '', len: m.params.response.headers['content-length'] || '' });
  }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 120000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Network.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8310/?static=1' });
await sleep(22000);

console.log('=== demo 按钮（空库空态下应出现在 ADD MUSIC FOLDER 下方）===');
console.log(await ev(`(function(){
  const b = document.getElementById('rhine-demo-btn');
  const add = document.querySelector('iframe[data-id="stage"]');
  if (!b) return '（按钮还没创建）';
  const cs = getComputedStyle(b), r = b.getBoundingClientRect();
  return JSON.stringify({ 文案: b.textContent, display: cs.display, 位置: Math.round(r.left) + ',' + Math.round(r.top), 尺寸: Math.round(r.width) + 'x' + Math.round(r.height), 底色: cs.backgroundColor, 文字色: cs.color });
})()`));
console.log('主题侧 ADD 命中区:', await S(`JSON.stringify(hits.get('ar-addmusic') || null)`));

console.log('\n=== 点击 demo 按钮 ===');
const rect = JSON.parse(await ev(`(function(){ const b = document.getElementById('rhine-demo-btn'); const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width/2, y: r.top + r.height/2 }); })()`));
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y, button: 'none', buttons: 0 }); await sleep(200);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1, buttons: 1 }); await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1, buttons: 0 });
await sleep(9000);
console.log('宿主曲库:', await ev(`JSON.stringify({ source: window.__RHINE_DEBUG__.LIB.source, files: window.__RHINE_DEBUG__.LIB.files.length, tracks: window.__RHINE_DEBUG__.LIB.tracks.length })`));
console.log('状态行:', await ev(`document.getElementById('log').textContent`));
console.log('主题侧:', await S(`JSON.stringify({ live: LIB.live, tracks: LIB.tracks.length, albums: LIB.albums.length })`));

console.log('\n=== 播放二创那首并拖动进度条（Range）===');
const idx = await ev(`window.__RHINE_DEBUG__.LIB.tracks.findIndex(t => /迷迭香/.test(String(t.path||'')))`);
console.log('二创曲目下标:', idx);
if (idx >= 0) {
  const p = await ev(`(window.__RHINE_DEBUG__.LIB.tracks[${idx}] || {}).path`);
  console.log('路径:', p);
  console.log('同名 .lrc 探测:', await S(`(function(){ const p = ${JSON.stringify('PLACEHOLDER')}; return 'skip'; })()`));
  await ev(`window.__RHINE_DEBUG__.playIndex(${idx})`);
  await sleep(6000);
  const before = await ev(`+window.__RHINE_DEBUG__.audio.currentTime.toFixed(2)`);
  await ev(`window.__RHINE_DEBUG__.audio.currentTime = 60`);
  await sleep(2500);
  const after = await ev(`+window.__RHINE_DEBUG__.audio.currentTime.toFixed(2)`);
  console.log(`拖动前 ${before}s → 设为 60s → 实际 ${after}s  ${after > 55 ? '✓ Range 生效（没有跳回 0）' : '✗ 跳回去了，Range 没生效'}`);
  console.log('音频请求（应出现 206 与 content-range）:');
  for (const a of audios.slice(-5)) console.log('   ', JSON.stringify(a));
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\demo-loaded.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/demo-loaded.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
