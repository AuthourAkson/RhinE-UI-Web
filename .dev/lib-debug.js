(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const cat = w.__RHINE_CATALOG__;
  const lib = w.__RHINE_LIBRARY__ || {};
  return JSON.stringify({
    catalogArrived: !!cat,
    catalogTracks: cat ? cat.tracks : null,
    catalogAlbums: cat ? cat.albums.length : null,
    libSource: lib.source,
    libFiles: (lib.files || []).length,
    themeLIB_live: ev('typeof LIB !== "undefined" ? LIB.live : "undef"'),
    themeLIB_tracks: ev('typeof LIB !== "undefined" ? LIB.tracks : "undef"'),
    themeLIB_gen: ev('typeof LIB !== "undefined" ? LIB.gen : "undef"'),
    themeHasWorker: ev('typeof libWorker !== "undefined" && libWorker ? "yes" : "no"'),
    themeThumbs: ev('typeof THUMBS !== "undefined" ? THUMBS.size : "undef"'),
  }, null, 1);
})()
