// 工具栏按钮点击测试：先 mousemove（触发主题的命中区注册），再点击，然后读状态
// 用法: node .dev/toolbar-test.mjs [port]
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
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
const click = async (x, y) => {
  await move(x, y); await sleep(120);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(700);
};
const state = () => ev(`(function(){ const w=document.querySelector('iframe[data-id=stage]').contentWindow; try { return JSON.stringify({unit:LIB.unit, layout:AR.layout, groupBy:LIB.groupBy, sortBy:LIB.sortBy}); } catch(e){ return 'ERR '+e.message; } })()`);
// 扫描工具栏某一行，列出所有按钮的 id 与 x 范围（悬停后才会注册，所以先扫一次带动 hover）
async function scanRow(y) {
  const xs = [];
  for (let x = 200; x < 1200; x += 20) {
    await move(x, y);
    const a = await ev(`(function(){ const w=document.querySelector('iframe[data-id=stage]').contentWindow; const r = w.eval('(function(){ try { const a = hits.at(${x}, ${y}); return a ? a.id : ""; } catch(e){ return ""; } })()'); return r; })()`);
    if (a) xs.push(`${x}:${a}`);
  }
  return xs.join(' ');
}
console.log('起始状态:', await state());
console.log('');
console.log('工具栏第 1 行 (y=105) 命中区:', (await scanRow(105)).slice(0, 400));
console.log('工具栏第 2 行 (y=138) 命中区:', (await scanRow(138)).slice(0, 400));
ws.close();
