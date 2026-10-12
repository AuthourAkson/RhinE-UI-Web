// 量化"选中时的渐变"：点一个磁带后，连续采样磁带窗口区域的平均色，检查是否**逐帧插值**
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 150000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

// 采样"某盘磁带窗口"的平均亮度（窗口 = cover quad 的中心区域）
const winLum = () => S(`(function(){
  try {
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d', { willReadFrequently: true });
    const dpr = window.devicePixelRatio || 1;
    // 选中那盘的外壳：取第一个命中区（AR.hits 里是 cover 四角）
    const h = AR.hits && AR.hits[0]; if (!h) return -1;
    const q = h.quad;
    const cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2;
    const x = Math.round((cx - 40) * dpr), y = Math.round((cy - 30) * dpr);
    const d = g.getImageData(x, y, Math.round(60 * dpr), Math.round(50 * dpr)).data;
    let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { s += (d[i] + d[i+1] + d[i+2]) / 3; n++; }
    return Math.round(s / n);
  } catch (e) { return -2; }
})()`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&fadequant=1' });
await sleep(20000);
await S('send("view","archive"); "ok"');
await sleep(3000);

const hit = await S(`(function(){ try { const h = (AR.hits && AR.hits[0]) || null; if (!h) return null; const q = h.quad; return JSON.stringify({ cx: (q[0][0]+q[2][0])/2, cy: (q[0][1]+q[2][1])/2 }); } catch (e) { return null; } })()`);
console.log('命中区:', hit);
const { cx, cy } = JSON.parse(hit);
const fr = JSON.parse(await ev(`(function(){ const b = document.querySelector('iframe[data-id="stage"]').getBoundingClientRect(); return JSON.stringify({ x: b.left, y: b.top }); })()`));

console.log('\n点击前窗口亮度:', await winLum());
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fr.x + cx, y: fr.y + cy, button: 'none', buttons: 0 }); await sleep(150);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fr.x + cx, y: fr.y + cy, button: 'left', clickCount: 1, buttons: 1 }); await sleep(30);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fr.x + cx, y: fr.y + cy, button: 'left', clickCount: 1, buttons: 0 });

const seq = [];
for (let i = 0; i < 16; i++) { seq.push(await winLum()); await sleep(55); }
console.log('点击后亮度序列:', seq.join(' → '));
const uniq = [...new Set(seq)];
console.log('不同取值的个数:', uniq.length, uniq.length >= 5 ? '✓ 是逐帧插值（渐变）' : '✗ 只有端点、没有中间态（突变）');
console.log('\n弹簧值 clear.x 轨迹:', await S(`(function(){ try { const r = AR.rows.get(AR.group); const c = r && r.cases.get(AR.hits[0].i); return c ? c.clear.x.toFixed(3) : '?'; } catch (e) { return 'EXC'; } })()`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\fade-quant.png', Buffer.from(shot.data, 'base64'));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
