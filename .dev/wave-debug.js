(async () => {
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow;
  const ev = (code) => { try { return w.eval(code); } catch (e) { return 'THROW ' + e.message; } };
  const out = {};
  const h = await ev('(function(){ const x = fb.GetNowPlaying(); return x ? JSON.stringify({ id: x.__id, path: x.Path, len: x.Length, size: x.FileSize }) : "null"; })()');
  out.handle = h;
  out.来源 = await ev(`(function(){
    const L = window.__RHINE_LIBRARY__, t = L && L.tracks[3];
    return t ? JSON.stringify({ url: t.url, hasFile: !!t.file, path: t.path, size: t.size }) : 'no track';
  })()`);
  // 直接 await 我的实现（小点数，快速）
  out.直接调用 = await w.eval(`(async function(){
    try {
      const hh = fb.GetNowPlaying();
      const r = await utils.GetWaveformAsync(hh, 64, 0, 0, () => true);
      return 'ok len=' + r.length + ' max=' + Math.max.apply(null, Array.from(r)).toFixed(4);
    } catch (e) { return 'ERR ' + (e && e.message); }
  })()`);
  out.AudioContext = await ev('typeof (window.AudioContext || window.webkitAudioContext)');
  out.decodeAudioData可用 = await ev('(function(){ try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return "没有 AC"; const ac = new AC(); return "state=" + ac.state + " rate=" + ac.sampleRate + " decode=" + (typeof ac.decodeAudioData); } catch (e) { return "ERR " + e.message; } })()');
  return JSON.stringify(out, null, 1);
})()
