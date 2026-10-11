// 用原版对同一首的真实 1024 个值做拟合：算几种候选算法的 MAE 与相关系数，挑最接近的
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

console.log(await ev(`(async function(){
  const orig = JSON.parse(await (await fetch('/.dev/orig-mili-wave.json')).text()).map(v => v / 1000);   // 0..1
  const buf = await (await fetch('/.dev/music/Miracle Milk/world.execute%20(me)%20%3B.mp3')).arrayBuffer();
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const ab = await ac.decodeAudioData(buf);
  const chans = []; for (let c = 0; c < ab.numberOfChannels; c++) chans.push(ab.getChannelData(c));
  const len = ab.length, N = 1024, per = len / N;
  const peak = new Float32Array(N), rms = new Float32Array(N), maxRms4 = new Float32Array(N), maxRms8 = new Float32Array(N);
  for (let b = 0; b < N; b++) {
    const a0 = Math.floor(b * per), a1 = Math.min(len, Math.max(a0 + 1, Math.floor((b + 1) * per)));
    let m = 0, sum = 0, cnt = 0;
    const sub = (k) => { // 第 k 个子窗的 RMS
      const s0 = a0 + Math.floor((a1 - a0) * k / 8), s1 = a0 + Math.floor((a1 - a0) * (k + 1) / 8);
      let ss = 0, cc = 0;
      for (const d of chans) for (let i = s0; i < Math.max(s0 + 1, s1); i++) { ss += d[i] * d[i]; cc++; }
      return Math.sqrt(ss / Math.max(1, cc));
    };
    for (const d of chans) for (let k = a0; k < a1; k++) { const v = d[k] < 0 ? -d[k] : d[k]; if (v > m) m = v; sum += d[k] * d[k]; cnt++; }
    peak[b] = m; rms[b] = Math.sqrt(sum / Math.max(1, cnt));
    let m4 = 0; for (let k = 0; k < 4; k++) m4 = Math.max(m4, sub(k * 2)); maxRms4[b] = m4;
    let m8 = 0; for (let k = 0; k < 8; k++) m8 = Math.max(m8, sub(k)); maxRms8[b] = m8;
  }
  const norm = (a) => { let m = 0; for (const v of a) if (v > m) m = v; return m > 0 ? Array.from(a, v => Math.min(1, v / m)) : Array.from(a); };
  const O = orig;
  const cands = {
    '峰值': norm(peak),
    'RMS': norm(rms),
    '√(峰值×RMS)': norm(Array.from({ length: N }, (_, i) => Math.sqrt(peak[i] * rms[i]))),
    '0.5峰值+0.5RMS': norm(Array.from({ length: N }, (_, i) => .5 * peak[i] + .5 * rms[i])),
    '峰值^0.35×RMS^0.65': norm(Array.from({ length: N }, (_, i) => Math.pow(peak[i], .35) * Math.pow(rms[i], .65))),
    '子窗最大RMS(4)': norm(maxRms4),
    '子窗最大RMS(8)': norm(maxRms8),
    '√(子窗最大RMS×RMS)': norm(Array.from({ length: N }, (_, i) => Math.sqrt(maxRms4[i] * rms[i]))),
  };
  const score = (A) => {
    let mae = 0, sa = 0, so = 0, saa = 0, soo = 0, sao = 0;
    for (let i = 0; i < N; i++) { mae += Math.abs(A[i] - O[i]); sa += A[i]; so += O[i]; }
    const ma = sa / N, mo = so / N;
    for (let i = 0; i < N; i++) { saa += (A[i] - ma) ** 2; soo += (O[i] - mo) ** 2; sao += (A[i] - ma) * (O[i] - mo); }
    return { MAE: +(mae / N * 1000).toFixed(1), 相关: +(sao / Math.sqrt(saa * soo)).toFixed(4), 均值: +(ma * 1000).toFixed(0), 前6: A.slice(0, 6).map(v => Math.round(v * 1000)).join(',') };
  };
  const rows = Object.entries(cands).map(([k, v]) => k.padEnd(22) + ' MAE=' + String(score(v).MAE).padStart(5) + '  相关=' + score(v).相关 + '  均值=' + String(score(v).均值).padStart(4) + '  前6=' + score(v).前6);
  return '原版:                 MAE=  ——    相关=1.0000  均值=' + Math.round(O.reduce((a, b) => a + b, 0) / N * 1000) + '  前6=' + O.slice(0, 6).map(v => Math.round(v * 1000)).join(',') + '\\n' + rows.join('\\n');
})()`));
ws.close();
