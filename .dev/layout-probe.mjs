// 用主题自己的设置项切 LAYOUT，检查播放列表的分组表头与列
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
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const H = (code) => ev(`document.querySelector('iframe[data-id="head"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&lay=1")');
await sleep(17000);
await S('send("view","playlists"); "ok"');
await sleep(2500);
console.log('当前预设（面板侧）:', await P('JSON.stringify({ 预设: STATE.preset, 列: COL_FMT[STATE.preset] ? COL_FMT[STATE.preset].length : null })'));
console.log('head 侧 STATE.preset:', await H('STATE.preset'));
console.log('设置文件里的 preset:', await H('getSetting("preset", "?")'));

// 用主题自己的设置项切换（等同于点 LAYOUT 里的 ALBUM）
for (const want of ['album', 'index', 'album']) {
  await H(`setSetting("preset", "${want}"); broadcast(); "ok"`);
  await sleep(1800);
  const rows = await P(`(function(){
    const out = [];
    for (const el of document.querySelectorAll('.prow')) {
      if (el.style.display === 'none') continue;
      out.push((el.classList.contains('group') ? '[组] ' : '     ') + JSON.stringify([...el.children].map(c => (c.textContent || '').trim())));
    }
    return out.join('\\n');
  })()`);
  console.log('\n===== 切到 ' + want + ' 后 =====');
  console.log('面板预设:', await P('STATE.preset'));
  console.log(rows);
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\playlist-album-layout.png', Buffer.from(shot.data, 'base64'));
console.log('已存 .dev/playlist-album-layout.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
