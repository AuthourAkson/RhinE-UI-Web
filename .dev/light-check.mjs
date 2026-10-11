// 切到浅色模式，逐点采样播放列表页各区域的背景色，找出仍然偏黑的区域
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 120000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const P = (code) => ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.eval(${JSON.stringify(code)})`);
const M = (code) => ev(`document.querySelector('iframe[data-id="manager"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

const panelStyle = () => ev(`(function(){
  const out = {};
  for (const f of document.querySelectorAll('iframe')) {
    try {
      const w = f.contentWindow, d = w.document;
      const body = getComputedStyle(d.body).backgroundColor;
      const html = getComputedStyle(d.documentElement).backgroundColor;
      out[f.dataset.id] = html + ' / ' + body;
    } catch (e) { out[f.dataset.id] = 'EXC'; }
  }
  return JSON.stringify(out);
})()`);

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&lightcheck=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);

console.log('=== 切换前（深色）各面板 html / body 背景 ===');
console.log(await panelStyle());

console.log('\n=== 切到浅色 ===');
await ev(`window.__RHINE_CMD__("mode:light")`);
await sleep(6000);
console.log('面板 tokens MODE:', await S('MODE'), ' C.bg:', await S('C.bg'), ' C.fg:', await S('C.fg'));
console.log('播放列表面板内:', await P(`JSON.stringify({ C_bg: C.bg, html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor })`));
console.log('\n=== 切换后各面板 html / body 背景 ===');
console.log(await panelStyle());

// 页面像素采样：播放列表下方空白区 / 左侧列表下方 / 右侧卡片 / 底部
const shot = await send('Page.captureScreenshot', { format: 'png' });
const shotUrl = 'data:image/png;base64,' + shot.data;
console.log('\n=== 页面像素采样（浅色模式下，亮度高的才正常）===');
console.log(await ev(`(async () => {
  const img = new Image(); img.src = ${JSON.stringify(shotUrl)}; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const dpr = 1.5;
  const px = (x, y) => { const d = g.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data; return d[0] + ',' + d[1] + ',' + d[2]; };
  const out = {};
  for (const f of document.querySelectorAll('iframe')) {
    const r = f.getBoundingClientRect();
    if (!f.__ready) continue;
    out[f.dataset.id] = { 上半: px(r.left + r.width / 2, r.top + r.height * 0.25), 下半: px(r.left + r.width / 2, r.top + r.height * 0.9) };
  }
  return JSON.stringify(out, null, 1);
})()`));
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\light-playlists.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/light-playlists.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
