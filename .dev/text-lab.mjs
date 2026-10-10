// 在指定面板 iframe 里做文字绘制实验，导出成 PNG
// 用法: node .dev/text-lab.mjs [panelId] [out.png] [port]
import fs from 'node:fs';
const [, , panelId = 'header', out = '.dev/textlab.png', port = '9226'] = process.argv;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.filter((t) => t.type === 'page')[0].webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout')); } }, 25000); });
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result.value;
}

const code = `(() => {
  const out = {};
  out.fontsInDoc = [...document.fonts].map(f => f.family + ':' + f.weight + ':' + f.status);
  out.checkGeist = document.fonts.check('400 13px "Geist Mono"');
  try {
    const f = d2d.Font('Geist Mono', 13, 0);
    out.fontCss = f.Css; out.fontHeight = f.Height; out.fontAscent = f.Ascent;
    const g0 = d2d.CreateImage(300, 40).GetGraphics();
    out.calcWidthAUDIO = g0.CalcTextWidth('AUDIO', f, false);
    out.calcWidthGlyphA = g0.CalcTextWidth('A', f, true);
    out.calcWidthZeroFlag = g0.CalcTextWidth('0', f, true);
  } catch (e) { out.fontErr = String(e); }
  try {
    const img = d2d.CreateImage(320, 60);
    const g = img.GetGraphics();
    g.FillSolidRect(0, 0, 320, 60, 0xFF101014);
    g.DrawText('HELLO 123', d2d.Font('Geist Mono', 14, 0), 0xFFFFFFFF, 0, 0, 200, 20, 0x00000800 | 0x00000020);
    g.DrawText('CENTERED', d2d.Font('Geist Mono', 12, 0), 0xFFFF7A01, 0, 22, 320, 18, 0x00000800 | 0x00000020 | 0x00000004 | 0x00000001);
    img.ReleaseGraphics(g);
    out.testDataUrl = img.__el.toDataURL('image/png');
    const ctx = img.__el.getContext('2d');
    const d = ctx.getImageData(0, 0, 320, 60).data;
    let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 60 || d[i+1] > 60 || d[i+2] > 60) lit++;
    out.litPixels = lit;
  } catch (e) { out.drawErr = String(e && e.stack || e); }
  return JSON.stringify({ meta: out, png: (out.testDataUrl || '').slice(22) });
})()`;

const raw = await ev(`(() => { const f = document.querySelector('iframe[data-id="${panelId}"]'); return f ? f.contentWindow.eval(${JSON.stringify(code)}) : 'NO_IFRAME'; })()`);
if (typeof raw !== 'string' || raw === 'NO_IFRAME') { console.log('失败:', raw); process.exit(1); }
const parsed = JSON.parse(raw);
console.log(JSON.stringify(parsed.meta, null, 1));
if (parsed.png) {
  const buf = Buffer.from(parsed.png, 'base64');
  fs.writeFileSync(out, buf);
  console.log(`已保存 ${out}  ${(buf.length / 1024).toFixed(1)} KB`);
}
ws.close();
