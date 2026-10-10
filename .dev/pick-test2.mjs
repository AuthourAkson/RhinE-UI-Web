// 拾取器端到端测试：Alt+点击真正可见的 root 面板
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
const altClick = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1, modifiers: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0, modifiers: 1 });
  await sleep(800);
};
const lastPick = () => ev('window.__RHINE_LAST_PICK__ || "（没有拾取记录）"');

console.log('页面:', await ev('location.search'));
const off = JSON.parse(await ev("(function(){ const r=document.querySelector('iframe[data-id=root]').getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}); })()"));
console.log('root 面板:', JSON.stringify(off));

for (const [label, x, y] of [
  ['工具栏 GROUP 附近 (590,138)', 590, 138],
  ['卡片 PLAY 按钮附近 (1158,470)', 1158, 470],
  ['货架外壳附近 (400,560)', 400, 560],
  ['顶栏导航 01 ARCHIVE (380,38)', 380, 38],
]) {
  await altClick(off.x + x, off.y + y);
  console.log(`  ${label.padEnd(30)} → ${await lastPick()}`);
}
console.log('');
console.log('拾取记录条数:', await ev('(window.PICK_LOG || []).length'));
ws.close();
