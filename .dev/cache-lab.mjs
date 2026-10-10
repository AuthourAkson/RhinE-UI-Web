// 清空主题文字缓存后重绘，验证"空位图被缓存"假说
import fs from 'node:fs';
const [, , panelId = 'header', out = '.dev/repaint2.png', port = '9226'] = process.argv;
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
    rep.cacheBefore = TEXT_CACHE.size;
    // 记录 label() 收到的参数
    const calls = [];
    const origLabel = window.label;
    window.label = function (gr, str, st, x, y, align) {
      const r = origLabel.apply(null, arguments);
      if (calls.length < 6) calls.push({ str: String(str).slice(0, 18), colour: st && st.colour, bg: st && st.bg, x, y, ret: r });
      return r;
    };
    TEXT_CACHE.clear();
    const img = d2d.CreateImage(W, H);
    const g = img.GetGraphics();
    g.FillSolidRect(0, 0, W, H, 0xFF000000);
    on_paint(g);
    img.ReleaseGraphics(g);
    const cv = img.__el;
    const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
    let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 90 || d[i+1] > 90 || d[i+2] > 90) lit++;
    rep.litAfterClear = lit;
    rep.cacheAfter = TEXT_CACHE.size;
    rep.calls = calls;
    rep.png = cv.toDataURL('image/png').slice(22);
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
