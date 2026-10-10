// 在模拟 150% 缩放（用户显示环境）下测试工具栏 12 个按钮 + 卡片播放
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 25000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

// ① 模拟 150% 缩放（用户显示环境）
await send('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: 1.5, mobile: false });
console.log('已模拟 devicePixelRatio=1.5');
await ev('location.assign("http://127.0.0.1:8300/?demo=1&click150=1")');
await sleep(16000);
console.log('dpr =', await ev('window.devicePixelRatio'), ' 画布 =', await ev("document.querySelector('iframe[data-id=stage]').contentWindow.document.querySelector('canvas').width + 'x' + document.querySelector('iframe[data-id=stage]').contentWindow.document.querySelector('canvas').height"));

// ② 从主题读按钮位置 + 当前状态
const info = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id=stage]');
  const r = f.getBoundingClientRect();
  const w = f.contentWindow;
  const out = { off: { x: Math.round(r.left), y: Math.round(r.top) } };
  // ⚠️ LIB/AR 是 const 词法声明，不在 window 上 —— 必须经 w.eval 从面板内读
  out.before = w.eval('(function(){ return { unit: LIB.unit, layout: AR.layout, group: LIB.groupBy, sort: LIB.sortBy }; })()');
  out.buttons = [];
  for (const id2 of ['ar-unit', 'ar-layout', 'ar-group', 'ar-sort']) {
    const arr = w.eval(\`(function(){
      const seen = [];
      for (let y = 20; y < 80; y += 2) for (let x = 0; x < 1200; x += 3) {
        const a = hits.at(x, y);
        if (a && a.id === '\${id2}' && !seen.some(s => s.data === a.data)) seen.push({ data: a.data, x: a.x + a.w / 2, y: a.y + a.h / 2 });
      }
      return seen;
    })()\`);
    out.buttons.push(...arr.map((b) => ({ id: id2, data: b.data, x: b.x, y: b.y })));
  }
  return JSON.stringify(out);
})()`));
console.log('找到按钮数:', info.buttons.length, '  当前:', JSON.stringify(info.before));

// ③ 逐个点击并验证状态变化
const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(50);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(450);
};
const state = () => ev(`(function(){ const w = document.querySelector('iframe[data-id=stage]').contentWindow; return w.eval('(function(){ return JSON.stringify({ unit: LIB.unit, layout: AR.layout, group: LIB.groupBy, sort: LIB.sortBy }); })()'); })()`);

let pass = 0, fail = 0;
for (const b of info.buttons) {
  const before = JSON.parse(await state());
  await click(info.off.x + b.x, info.off.y + b.y);
  const after = JSON.parse(await state());
  const keyMap = { 'ar-unit': 'unit', 'ar-layout': 'layout', 'ar-group': 'group', 'ar-sort': 'sort' };
  const k = keyMap[b.id];
  const ok = after[k] === b.data;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${b.id.padEnd(10)} data=${String(b.data).padEnd(7)} → ${k}=${after[k]}${ok ? '' : '（期望 ' + b.data + '）'}`);
}

// ④ 卡片播放按钮
const play = JSON.parse(await ev(`(function(){
  const f = document.querySelector('iframe[data-id=stage]'); const r = f.getBoundingClientRect();
  const w = f.contentWindow;
  const a = w.eval("hits.get('ar-play')");
  return JSON.stringify(a ? { x: r.left + a.x + a.w / 2, y: r.top + a.y + a.h / 2 } : null);
})()`));
if (play) {
  const before = await ev('window.__RHINE_DEBUG__.SHARED.transport.playing');
  await click(play.x, play.y);
  await sleep(700);
  const after = await ev('window.__RHINE_DEBUG__.SHARED.transport.playing');
  console.log(`  ${after ? '✓' : '✗'} ar-play    → playing=${after}（点击前 ${before}）`);
  after ? pass++ : fail++;
  if (after) { await click(play.x, play.y); await sleep(300); }  // 停掉
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败  (dpr=1.5)`);
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
process.exit(fail ? 1 : 0);
