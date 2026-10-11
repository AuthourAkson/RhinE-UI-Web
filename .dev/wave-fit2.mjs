// 在原版真值上比较各候选的：均值、变异系数(CV)、相关系数、MAE —— 目标是同时贴近原版的 819 与 CV 0.172
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 90000); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 150);
  return r.result.value;
};
await ev('location.assign("http://127.0.0.1:8300/panel.html")');
await new Promise((r) => setTimeout(r, 2000));
console.log(await ev(`(async () => {
  // 原版真值（之前从它的缓存复制过来的；如果没有就现场再从缓存文件里取）
  const orig = JSON.parse(await (await fetch('/.dev/orig-mili-wave.json')).text()).map(v => v / 1000);
  const buf = await (await fetch('/.dev/music/Miracle Milk/world.execute%20(me)%20%3B.mp3')).arrayBuffer();
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const ab = await ac.decodeAudioData(buf);
  const chans = []; for (let c = 0; c < ab.numberOfChannels; c++) chans.push(ab.getChannelData(c));
  const len = ab.length, N = 1024, per = len / N;
  const peak = new Float32Array(N), rms = new Float32Array(N);
  for (let b = 0; b < N; b++) {
    const a0 = Math.floor(b * per), a1 = Math.min(len, Math.max(a0 + 1, Math.floor((b + 1) * per)));
    let m = 0, sum = 0, cnt = 0;
    for (const d of chans) for (let k = a0; k < a1; k++) { const v = d[k] < 0 ? -d[k] : d[k]; if (v > m) m = v; sum += d[k] * d[k]; cnt++; }
    peak[b] = m; rms[b] = Math.sqrt(sum / Math.max(1, cnt));
  }
  const norm = (a) => { let m = 0; for (const v of a) if (v > m) m = v; return m > 0 ? Array.from(a, v => Math.min(1, v / m)) : Array.from(a); };
  const stat = (A) => {
    const n = A.length, mean = A.reduce((x, y) => x + y, 0) / n;
    const sd = Math.sqrt(A.reduce((x, y) => x + (y - mean) ** 2, 0) / n);
    let sao = 0, saa = 0, soo = 0;
    const mo = orig.reduce((x, y) => x + y, 0) / n, ma = mean;
    for (let i = 0; i < n; i++) { sao += (A[i] - ma) * (orig[i] - mo); saa += (A[i] - ma) ** 2; soo += (orig[i] - mo) ** 2; }
    let mae = 0; for (let i = 0; i < n; i++) mae += Math.abs(A[i] - orig[i]);
    return { 均值: Math.round(mean * 1000), CV: +(sd / mean).toFixed(3), 相关: +(sao / Math.sqrt(saa * soo)).toFixed(4), MAE: +(mae / n * 1000).toFixed(1) };
  };
  const O = stat(orig);
  const cands = {
    '峰值': norm(peak),
    'RMS': norm(rms),
    '√(峰值×RMS)': norm(Array.from({ length: N }, (_, i) => Math.sqrt(peak[i] * rms[i]))),
    '0.5峰值+0.5RMS': norm(Array.from({ length: N }, (_, i) => .5 * peak[i] + .5 * rms[i])),
    '几何^1.15': norm(Array.from({ length: N }, (_, i) => Math.pow(Math.sqrt(peak[i] * rms[i]), 1.15))),
    '几何^1.3': norm(Array.from({ length: N }, (_, i) => Math.pow(Math.sqrt(peak[i] * rms[i]), 1.3))),
    '算术^1.15': norm(Array.from({ length: N }, (_, i) => Math.pow(.5 * peak[i] + .5 * rms[i], 1.15))),
    '算术^1.3': norm(Array.from({ length: N }, (_, i) => Math.pow(.5 * peak[i] + .5 * rms[i], 1.3))),
    '0.65峰+0.35RMS': norm(Array.from({ length: N }, (_, i) => .65 * peak[i] + .35 * rms[i])),
  };
  const lines = ['原版真值            ' + JSON.stringify(O)];
  for (const [k, v] of Object.entries(cands)) lines.push(k.padEnd(20) + JSON.stringify(stat(v)));
  return lines.join('\\n');
})()`));
ws.close();
