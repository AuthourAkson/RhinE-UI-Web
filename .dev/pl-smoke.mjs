// 播放列表视图冒烟测试：列对齐 + 行渲染 + 交互，在 1707×899 CSS @dpr1.5 下
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
const fs = await import('node:fs');
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\' + name, Buffer.from(s.data, 'base64'));
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&pl=1")');
await sleep(17000);
console.log('dpr =', await ev('devicePixelRatio'));

// 切到 02 PLAYLISTS 视图（主题自己的消息）
await ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval('send("view","playlists")')`);
await sleep(2500);

const info = await ev(`(function(){
  const ids = ['manager','head','playlist','card'];
  const out = {};
  for (const id of ids) {
    const f = document.querySelector('iframe[data-id="' + id + '"]');
    if (!f) { out[id] = '(无)'; continue; }
    const r = f.getBoundingClientRect();
    let inside = '';
    try {
      const w = f.contentWindow, d = w.document;
      inside = ' rows=' + d.querySelectorAll('.prow').length
        + ' display=' + getComputedStyle(d.querySelector('.prow') || d.body).display
        + ' bodyChildren=' + d.body.children.length;
    } catch (e) { inside = ' ERR ' + e.message; }
    out[id] = Math.round(r.width) + 'x' + Math.round(r.height) + ' @' + Math.round(r.left) + ',' + Math.round(r.top) + inside;
  }
  return JSON.stringify(out, null, 1);
})()`);
console.log('面板:', info);

const detail = await ev(`(function(){
  const w = document.querySelector('iframe[data-id="playlist"]').contentWindow;
  const h = document.querySelector('iframe[data-id="head"]').contentWindow;
  const e2 = (win, code) => { try { return win.eval(code); } catch (err) { return 'ERR ' + err.message; } };
  return JSON.stringify({
    播放列表: {
      W_H: e2(w, 'W + "x" + H'),
      PL: e2(w, 'PL'),
      行数: e2(w, 'rows.length'),
      组数: e2(w, 'rows.filter(r => r.group).length'),
      预设: e2(w, 'STATE.preset'),
      列: e2(w, 'JSON.stringify(layout.map(c => ({ t: c.c.title, x: Math.round(c.x), w: Math.round(c.w) })))'),
      首个数据行: e2(w, 'JSON.stringify(rows.slice(0, 12))'),
      DOM文本: e2(w, '[...document.querySelectorAll(".prow")].slice(0, 6).map(r => r.textContent).join(" | ")'),
    },
    head列: e2(h, 'JSON.stringify(columnLayout(presetMeta()).map(c => ({ t: c.c.title, x: Math.round(c.x), w: Math.round(c.w) })))'),
    head尺寸: e2(h, 'VIEW.w + "x" + VIEW.h'),
  }, null, 1);
})()`);
console.log('细节:', detail);
await shot('playlists-view.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
