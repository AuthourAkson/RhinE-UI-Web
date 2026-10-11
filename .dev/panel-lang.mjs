// 各面板的语言状态对比：为什么 header 是英文而别的面板是中文
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160);
  return r.result.value;
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&panels=1")');
await sleep(17000);

for (const pane of ['header', 'stage', 'transport', 'manager', 'root']) {
  const r = await ev(`(function(){
    const f = document.querySelector('iframe[data-id="${pane}"]');
    if (!f) return '没有该面板';
    const w = f.contentWindow;
    try {
      return w.eval('JSON.stringify({ 设置里的uiLang: typeof getSetting === "function" ? getSetting("uiLang", "(无)") : "无 getSetting", SYSTEM_LANG: typeof SYSTEM_LANG !== "undefined" ? SYSTEM_LANG : "?", UI_LANG: typeof UI_LANG !== "undefined" ? UI_LANG : "?", 中文表: typeof I18N !== "undefined" && !!I18N["zh-CN"], 抽样: typeof tr === "function" ? tr("ARCHIVE") : "无 tr" })');
    } catch (e) { return 'EXC ' + e.message; }
  })()`);
  console.log(pane.padEnd(10), r);
}
console.log('\n设置文件内容（前 200 字）:');
console.log(await ev(`(function(){ try { const s = localStorage.getItem('rhine:file:audio-archive-settings.json') || ''; return s.slice(0, 200) || '(空)'; } catch (e) { return 'ERR ' + e.message; } })()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
