// 波形验证：① 直接调 waveLoad 测解码 ② 切到另一首看自动加载
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 60000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const wave = () => S('JSON.stringify({ key: Wave.key, loaded: Wave.loaded, max: Wave.peaks ? +Math.max(...Wave.peaks).toFixed(3) : 0, avg: Wave.peaks ? +(Array.from(Wave.peaks).reduce((a,b)=>a+b,0)/Wave.peaks.length).toFixed(4) : 0 })');
const audio = () => S('JSON.stringify({ live: AUDIO.live, energy: +AUDIO.energy.toFixed(3), peak: +AUDIO.peakDb.toFixed(1), corr: +AUDIO.corr.toFixed(2) })');

console.log('① 直接调用 waveLoad（测解码链路）…');
console.log('   调用前:', await wave());
await S('waveLoad(fb.GetNowPlaying(), () => {}); "called"');
for (const t of [500, 1000, 2000, 3000]) { await sleep(t === 500 ? 500 : 1000); console.log(`   +${t}ms:`, await wave()); }

console.log('\n② 切到另一首（让 loadTrack 走 !same 分支，看是否自动加载波形）…');
await S('send("view","signal"); "ok"');
await sleep(800);
console.log('   切换前:', await wave());
await S('fb.Next(); "next"');   // 下一首 → 触发 on_playback_new_track → loadTrack → waveLoad
await sleep(3500);
console.log('   切换后:', await wave());
console.log('   实时:', await audio());
