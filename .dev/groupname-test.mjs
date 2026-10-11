// 分组名（之前是伪斜体）在中文 / 英文下的对比
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
await ev('location.assign("http://127.0.0.1:8300/?demo=1&grp=1")');
await sleep(9000);

for (const lang of ['zh-CN', 'en']) {
  await ev(`(function(){ const k='rhine:file:audio-archive-settings.json'; const o=JSON.parse(localStorage.getItem(k)||'{}'); o.uiLang=${JSON.stringify(lang)}; localStorage.setItem(k, JSON.stringify(o,null,1)); return 'ok'; })()`);
  await send('Page.reload');
  await sleep(15000);
  await S('send("view","archive"); "ok"');
  await sleep(2500);
  console.log('\n语言', lang, ' 分组名:', await S('(function(){ const g = curGroup(); return g ? groupName(g.name) : "?"; })()'));
  console.log('  该标签用的字体:', await S(`(function(){
    const g = curGroup(), name = g ? groupName(g.name) : '';
    const st2 = st(AR_ST.group, C.fg);
    const f = fontFor(name, stSize(st2), st2.weight || 400);
    return JSON.stringify({ 字体: f.Css, weight: st2.weight, track: st2.track });
  })()`));
  const geo = JSON.parse(await S(`JSON.stringify((function(){ const cx = Math.round(arrayW() * .774), y = H - dp(82); return { cx, y }; })())`));
  const stage = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="stage"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: stage.x + geo.cx - 180, y: stage.y + geo.y - 6, width: 360, height: 46, scale: 5 } });
  fs.writeFileSync(`D:\\AgentTestLab\\RhinE-UI\\.dev\\groupname-${lang === 'en' ? 'en' : 'zh'}.png`, Buffer.from(shot.data, 'base64'));
  console.log('  已存 .dev/groupname-' + (lang === 'en' ? 'en' : 'zh') + '.png');
}
// 恢复中文
await ev(`(function(){ const k='rhine:file:audio-archive-settings.json'; const o=JSON.parse(localStorage.getItem(k)||'{}'); o.uiLang='zh-CN'; localStorage.setItem(k, JSON.stringify(o,null,1)); return 'ok'; })()`);
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
