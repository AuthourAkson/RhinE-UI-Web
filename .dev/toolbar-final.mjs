// 工具栏按钮"逐个点击"确定性测试：位置直接问主题要（hits.at 扫描 stage 坐标）
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 20000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const inStage = (js) => ev(`document.querySelector('iframe[data-id=stage]').contentWindow.eval(${JSON.stringify(js)})`);
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
const click = async (x, y) => {
  await move(x, y); await sleep(120);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(900);
};
const state = () => inStage("(function(){ try { return 'unit='+LIB.unit+' layout='+AR.layout+' groupBy='+LIB.groupBy+' sortBy='+LIB.sortBy; } catch(e){ return 'ERR '+e.message; } })()");
// stage 面板在整页里的偏移（工具栏命中区用 stage 内坐标，CDP 点击要整页坐标）
const off = await ev(`(function(){ const f=document.querySelector('iframe[data-id=stage]'); const r=f.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left), y:Math.round(r.top)}); })()`);
const O = JSON.parse(off);
console.log('stage 面板偏移:', off);
console.log('起始:', await state());

const buttons = [];
for (const y of [31, 63]) {
  for (let x = 520; x < 1120; x += 4) {
    const a = await inStage(`(function(){ try { const a = hits.at(${x}, ${y}); return a ? a.id + '|' + JSON.stringify(a.data) : ''; } catch(e){ return ''; } })()`);
    if (a && !buttons.some((b) => b.key === a)) buttons.push({ key: a, x: x + O.x, y: y + O.y });
  }
}
console.log('');
console.log('=== 逐个点击（位置取自主题命中区） ===');
for (const b of buttons) {
  await click(b.x, b.y);
  console.log(`  ${b.key.padEnd(30)} → ${await state()}`);
}
ws.close();
