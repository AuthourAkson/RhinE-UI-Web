// 测试主题真实文字路径：label() / text() 画进离屏位图 → 导出 PNG
import fs from 'node:fs';
const [, , panelId = 'header', out = '.dev/labellab.png', port = '9226'] = process.argv;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.filter((t) => t.type === 'page')[0].webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout')); } }, 25000); });
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result.value;
}

const code = `(() => {
  const rep = {};
  try {
    rep.ST = typeof ST !== 'undefined' ? JSON.stringify(ST) : 'undef';
    rep.Cfg = typeof C !== 'undefined' ? JSON.stringify(C) : 'undef';
    const img = d2d.CreateImage(520, 150);
    const g = img.GetGraphics();
    g.FillSolidRect(0, 0, 520, 150, C.bg);
    // ① 主题真正的 label()（带字距，内部走 位图缓存 + DrawImage）
    rep.labelW = label(g, 'AUDIO ARCHIVE', st(ST.ident, C.fg), 12, 8);
    // ② 主题的 text()（直接 DrawText）
    text(g, 'PLAIN TEXT 123', 12, 400, C.fg, 12, 40, 480, 18, 0);
    // ③ 直接把缓存位图贴到测试画布（绕开 label 内部的 DrawImage）
    const L = labelBitmap('CACHED LABEL', st(ST.ident, C.fg));
    rep.cached = L ? { w: L.w, h: L.h, ready: !!L.img.__ready, hasEl: !!L.img.__el } : null;
    if (L) g.DrawImage(L.img, 12, 70, L.w, L.h, 0, 0, L.w, L.h);
    img.ReleaseGraphics(g);
    const ctx = img.__el.getContext('2d');
    const d = ctx.getImageData(0, 0, 520, 150).data;
    let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 70 || d[i+1] > 70 || d[i+2] > 70) lit++;
    rep.lit = lit;
    rep.png = img.__el.toDataURL('image/png').slice(22);
  } catch (e) { rep.err = String(e && e.stack || e); }
  return JSON.stringify(rep);
})()`;

const raw = await ev(`(() => { const f = document.querySelector('iframe[data-id="${panelId}"]'); return f ? f.contentWindow.eval(${JSON.stringify(code)}) : 'NO_IFRAME'; })()`);
if (typeof raw !== 'string') { console.log('失败:', JSON.stringify(raw)); process.exit(1); }
const p = JSON.parse(raw);
const { png, ...meta } = p;
console.log(JSON.stringify(meta, null, 1));
if (png) { fs.writeFileSync(out, Buffer.from(png, 'base64')); console.log('已保存', out); }
ws.close();
