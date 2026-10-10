(() => {
  const d = window.__RHINE_DEBUG__ || {};
  const a = d.audio;
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const t = d.LIB && d.LIB.tracks && d.LIB.playing && d.LIB.playing.item >= 0 ? d.LIB.tracks[d.LIB.playing.item] : null;
  return JSON.stringify({
    audio: a ? { paused: a.paused, t: Math.round((a.currentTime || 0) * 10) / 10, dur: Math.round((a.duration || 0) * 10) / 10, vol: Math.round(a.volume * 100) / 100, src: String(a.currentSrc || '').split('/').pop().slice(0, 40) } : null,
    transport: d.SHARED ? d.SHARED.transport : null,
    playing: t ? `${t.title} [${t.album}]` : null,
    themeIsPlaying: ev('typeof fb !== "undefined" ? fb.IsPlaying : "undef"'),
    themeTime: ev('typeof fb !== "undefined" ? Math.round(fb.PlaybackTime * 10) / 10 : "undef"'),
    themeLen: ev('typeof fb !== "undefined" ? Math.round(fb.PlaybackLength) : "undef"'),
    themeNowPlaying: ev('typeof fb !== "undefined" && fb.GetNowPlaying() ? "有" : "无"'),
    hud: (document.getElementById('log') || {}).textContent,
  }, null, 1);
})()
