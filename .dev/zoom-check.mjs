// 英文下放大检查：货架分组名 "UNKNOWN" 的末字、以及开场 "SESSION AUTHORIZED"
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&zoom=1")');
await sleep(9000);
await ev(`(function(){ const key='rhine:file:audio-archive-settings.json'; const o=JSON.parse(localStorage.getItem(key)||'{}'); o.uiLang='en'; localStorage.setItem(key, JSON.stringify(o,null,1)); return 'ok'; })()`);
await send('Page.reload');
await sleep(16000);
await S('send("view","archive"); "ok"');
await sleep(3000);
console.log('语言:', await S('UI_LANG'), ' 分组名:', await S(`(function(){ const g = curGroup(); return g ? groupName(g.name) : '?'; })()`));

// 用主题自己的几何算页面坐标
const geo = JSON.parse(await S(`JSON.stringify((function(){
  const cx = Math.round(arrayW() * .774), y = H - dp(82);
  return { cx, y, innerW: W, innerH: H };
})())`));
const stage = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="stage"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
const crop = {
  x: stage.x + geo.cx - 190, y: stage.y + geo.y - 10,
  width: 380, height: 70, scale: 6,
};
console.log('裁剪区域（页面坐标）:', JSON.stringify(crop));
const shot = await send('Page.captureScreenshot', { format: 'png', clip: crop });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\zoom-unknown-en.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/zoom-unknown-en.png（放大 6 倍）');

// 开场动画：触发 boot 影片并连拍，找 SESSION AUTHORIZED 那一帧
console.log('\n触发开场动画…');
await S('send("boot-play"); "ok"');
for (let i = 0; i < 22; i++) {
  await sleep(420);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`D:\\AgentTestLab\\RhinE-UI\\.dev\\boot-${String(i).padStart(2, '0')}.png`, Buffer.from(s.data, 'base64'));
}
console.log('已连拍 22 帧（.dev/boot-NN.png）');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
