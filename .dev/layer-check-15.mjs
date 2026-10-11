// 在 dpr=1.5 的同一会话内检查：资料卡离屏层后备是否已按 DPR 放大
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
await send('Emulation.setDeviceMetricsOverride', { width: 1349, height: 777, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&layer=1")');
await sleep(17000);
console.log(await ev(`(function(){
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev2 = (e) => { try { return w.eval(e); } catch (err) { return 'ERR ' + err.message; } };
  return JSON.stringify({
    设备像素比: w.devicePixelRatio,
    资料卡逻辑尺寸: ev2('AR.info ? AR.info.w + "x" + AR.info.h : "无"'),
    资料卡后备画布: ev2('AR.info ? AR.info.img.__el.width + "x" + AR.info.img.__el.height : "无"'),
    磁带的tinted层: ev2('(function(){ try { const I = arrayImages(); const t = tinted(I.frost, .3, "probe"); return t.__el.width + "x" + t.__el.height + " 逻辑 " + t.Width + "x" + t.Height + " dpr=" + t.__dpr; } catch(e) { return "ERR " + e.message; } })()'),
    主画布: ev2('document.querySelector("canvas").width + "x" + document.querySelector("canvas").height + " css=" + document.querySelector("canvas").style.width'),
  }, null, 1);
})()`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
