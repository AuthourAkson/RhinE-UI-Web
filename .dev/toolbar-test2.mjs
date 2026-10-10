// 工具栏点击测试（修正版：状态在 iframe 内求值；悬停后等一次重绘再读命中区）
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
  await move(x, y); await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(70);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(800);
};
const state = () => inStage("(function(){ try { return 'unit='+LIB.unit+' layout='+AR.layout+' groupBy='+LIB.groupBy+' sortBy='+LIB.sortBy; } catch(e){ return 'ERR '+e.message; } })()");

console.log('起始:', await state());

// 扫描两行，找出每个按钮的真实 x 范围
for (const y of [104, 138]) {
  const found = [];
  for (let x = 200; x < 1300; x += 10) {
    await move(x, y);
    await sleep(35);                       // 等一次重绘，命中区才会注册
    const a = await inStage(`(function(){ try { const a = hits.at(${x}, ${y}); return a ? a.id + '|' + JSON.stringify(a.data) : ''; } catch(e){ return ''; } })()`);
    if (a && (!found.length || found[found.length - 1].id !== a)) found.push({ id: a, x });
  }
  console.log(`y=${y} 命中区:`, found.map((f) => `${f.id}@${f.x}`).join('  ') || '（无）');
}

// 逐个点击刚扫出来的按钮
const targets = [];
for (const y of [104, 138]) {
  for (let x = 200; x < 1300; x += 10) {
    await move(x, y); await sleep(30);
    const a = await inStage(`(function(){ try { const a = hits.at(${x}, ${y}); return a ? a.id + '|' + JSON.stringify(a.data) : ''; } catch(e){ return ''; } })()`);
    if (a && !targets.some((t) => t.id === a)) targets.push({ id: a, x, y });
  }
}
console.log('');
console.log('=== 逐个点击 ===');
for (const t of targets) {
  await click(t.x, t.y);
  console.log(`  ${t.id.padEnd(34)} → ${await state()}`);
}
ws.close();
