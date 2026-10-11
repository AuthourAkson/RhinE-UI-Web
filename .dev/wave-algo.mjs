// 在同一首（Mili）上对比三种取值方式，和原版缓存数据（3ea83b65.json）比分布
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
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await ev('location.assign("http://127.0.0.1:8300/panel.html")');
await new Promise((r) => setTimeout(r, 2500));

const out = await ev(`(async function(){
  const url = '/.dev/music/Miracle Milk/world.execute%20(me)%20%3B.mp3';
  const buf = await (await fetch(url)).arrayBuffer();
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const ab = await ac.decodeAudioData(buf);
  const chans = []; for (let c = 0; c < ab.numberOfChannels; c++) chans.push(ab.getChannelData(c));
  const len = ab.length, N = 1024, per = len / N;
  const peak = new Float32Array(N), rms = new Float32Array(N), mixed = new Float32Array(N);
  for (let b = 0; b < N; b++) {
    const a0 = Math.floor(b * per), a1 = Math.min(len, Math.max(a0 + 1, Math.floor((b + 1) * per)));
    let m = 0, sum = 0, cnt = 0;
    for (const d of chans) for (let k = a0; k < a1; k++) { const v = d[k] < 0 ? -d[k] : d[k]; if (v > m) m = v; sum += d[k] * d[k]; cnt++; }
    peak[b] = m; rms[b] = Math.sqrt(sum / Math.max(1, cnt));
    mixed[b] = Math.sqrt(Math.max(0, m * rms[b]));            // 几何平均：兼顾瞬态与响度
  }
  const norm = (a) => { let m = 0; for (const v of a) if (v > m) m = v; return m > 0 ? Array.from(a, v => Math.min(1, v / m)) : Array.from(a); };
  const stat = (a) => {
    const n = a.length, s = a.slice().sort((x, y) => x - y), q = (p) => s[Math.floor(p * (n - 1))];
    return { 均值: +(a.reduce((x, y) => x + y, 0) / n * 1000).toFixed(0), p50: q(.5) * 1000 | 0, p90: q(.9) * 1000 | 0, gt900: +(a.filter(v => v > .9).length / n * 100).toFixed(1), 前12: a.slice(0, 12).map(v => Math.round(v * 1000)).join(','), 末12: a.slice(-12).map(v => Math.round(v * 1000)).join(',') };
  };
  const P = norm(peak), R = norm(rms), M = norm(mixed);
  return JSON.stringify({ 时长: +ab.duration.toFixed(2), 原版参考: { 均值: 818, p50: 875, p90: 998, gt900: 40.5, 前12: '74,492,382,551,520,491,536,398,541,387,603,434', 末12: '1,1,1,1,1,1,1,1,1,0,0,0' }, 峰值法: stat(P), RMS法: stat(R), 几何平均: stat(M) }, null, 1);
})()`);
console.log(out);
ws.close();
