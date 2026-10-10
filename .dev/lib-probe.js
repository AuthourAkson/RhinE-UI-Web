(() => {
  const lib = window.__RHINE_LIBRARY__ || {};
  const stage = document.querySelector('iframe[data-id="stage"]');
  const sw = stage && stage.contentWindow;
  const evs = (e) => { try { return sw.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const errs = (window.__ERRORS || []).filter((m) => /⚠️|Error|error|失败/.test(m));
  const root = document.querySelector('iframe[data-id="root"]').contentWindow;
  const evr = (e) => { try { return root.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  return JSON.stringify({
    source: lib.source,
    files: (lib.files || []).length,
    tracks: (lib.tracks || []).length,
    albums: (lib.albums || []).map((a) => `${a.title} / ${a.artist} / ${a.tracks}首 / ${a.length}s / ${a.codec}`),
    playlists: (lib.playlists || []).map((p) => `${p.name}: ${p.items.length}`),
    themeTracks: evr('typeof LIB !== "undefined" ? LIB.tracks : "undef"'),
    themeAlbums: evs('typeof LIB !== "undefined" && LIB.albums ? LIB.albums.length : "undef"'),
    themeLive: evs('typeof LIB !== "undefined" ? LIB.live : "undef"'),
    stageView: evs('typeof STATE !== "undefined" ? STATE.view : "undef"'),
    hud: (document.getElementById('log') || {}).textContent,
    errors: errs.slice(-5),
  }, null, 1);
})()
