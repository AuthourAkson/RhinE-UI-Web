(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const root = document.querySelector('iframe[data-id="root"]').contentWindow;
  const evr = (e) => { try { return root.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const cat = w.__RHINE_CATALOG__;
  const errs = (window.__ERRORS || []).filter((m) => /⚠️|Error|error|失败/.test(m));
  return JSON.stringify({
    catalog: cat ? { tracks: cat.tracks, albums: cat.albums.length, ms: Math.round(cat.ms.index) } : null,
    albumsDetail: cat ? cat.albums.map((a) => `${a.title} · ${a.artist} · ${a.tracks}曲 · ${a.length}s · ${a.codec}`) : [],
    tracksDetail: cat ? cat.items.slice(0, 8).map((t) => `${t.title} [${t.albumTitle}] ${t.length}s`) : [],
    themeLive: ev('typeof LIB !== "undefined" ? LIB.live : "undef"'),
    themeAlbums: ev('typeof LIB !== "undefined" && LIB.albums ? LIB.albums.length : "undef"'),
    themeThumbs: ev('typeof THUMBS !== "undefined" ? THUMBS.size : "undef"'),
    rootView: evr('typeof STATE !== "undefined" ? STATE.view : "undef"'),
    hud: (document.getElementById('log') || {}).textContent,
    liveErrors: errs.slice(-4),
  }, null, 1);
})()
