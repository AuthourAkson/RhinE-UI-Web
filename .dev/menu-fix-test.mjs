// 验证：① 空的原生菜单不再出现 ② 子菜单能"走过缝隙"保持展开 ③ 三级菜单可用
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 150);
  return r.result.value;
};
const H = (code) => ev(`document.querySelector('iframe[data-id="header"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');
const rows = () => ev(`(function(){
  const out = [];
  const walk = (box, depth) => { for (const row of box.children) { if (row.style && row.style.position === 'fixed') { walk(row, depth + 1); continue; } const b = row.getBoundingClientRect(); if (b.width > 1) out.push({ t: (row.textContent||'').trim().slice(0,24), x: b.left + b.width/2, y: b.top + b.height/2, l: Math.round(b.left), tp: Math.round(b.top), d: depth }); } };
  for (const box of [...document.body.children]) if (box.style && box.style.position === 'fixed') walk(box, 0);
  return JSON.stringify(out);
})()`).then((s) => { try { return JSON.parse(s); } catch (e) { return []; } });
// 逐点移动：模拟真实鼠标轨迹（一次跳过去不会触发 mouseenter/mouseleave 的时序问题）
const glide = async (x1, y1, x2, y2, steps = 8, pause = 40) => {
  for (let i = 0; i <= steps; i++) {
    const x = x1 + (x2 - x1) * i / steps, y = y1 + (y2 - y1) * i / steps;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await sleep(pause);
  }
};
const clickOnly = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(400);
};

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&fix=2")');
await sleep(17000);
const hit = JSON.parse(await H(`(function(){ const a = hits.get('menu'); return JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }); })()`));
const fr = JSON.parse(await ev(`(function(){ const r = document.querySelector('iframe[data-id="header"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top }); })()`));
const cx = fr.x + hit.x + hit.w / 2, cy = fr.y + hit.y + hit.h / 2;
await glide(cx - 200, cy, cx, cy, 6);
await clickOnly(cx, cy);
await sleep(600);
const l1 = await rows();
console.log('① 顶层菜单（应只剩 Audio Archive，不再有 File/Edit… 空菜单）:');
console.log('   ' + (l1.map((r) => r.t).join(' | ') || '(空)'));

const aa = l1.find((r) => /Audio Archive/.test(r.t));
if (aa) {
  // 从菜单外逐点移到 Audio Archive 行
  await glide(cx - 60, cy + 120, aa.x, aa.y, 10);
  await sleep(500);
  const l2 = await rows();
  console.log('\n② 悬停 Audio Archive → 子菜单条目数:', l2.length, '（本层+子层）');
  console.log('   末尾 5 项:', l2.slice(-5).map((r) => r.t).join(' | '));
  // 关键：从该行"向外走一段再走进子菜单"，验证不会中途消失
  const lang = l2.find((r) => /Language|语言|言語/.test(r.t));
  if (lang) {
    console.log('\n③ 从 Audio Archive 行走向 Language 行（逐点，模拟真实移动）…');
    await glide(aa.x, aa.y, lang.x, lang.y, 10);
    await sleep(500);
    const l3 = await rows();
    const langs = l3.filter((r) => /English|简体中文|日本語/.test(r.t));
    console.log('   走完后语言子菜单:', JSON.stringify(langs.map((r) => r.t)));
    // 再走开一点点再回来，验证"缝隙"不会让它消失
    await glide(lang.x, lang.y, lang.x - 60, lang.y + 10, 5);
    await sleep(150);
    const mid = (await rows()).filter((r) => /English|简体中文|日本語/.test(r.t));
    console.log('   移到子菜单内部（左移 60px）后仍在:', JSON.stringify(mid.map((r) => r.t)));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\menu-fixed.png', Buffer.from(shot.data, 'base64'));
    console.log('   已存 .dev/menu-fixed.png');
  }
}
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
