(() => {
  const D = window.__RHINE_DEBUG__;
  const L = D.LIB;
  const out = {
    曲目数: L.tracks.length,
    前两条: L.tracks.slice(0, 2).map((t) => ({ title: t.title, size: t.size, length: t.length, path: t.path })),
    size有没有值: L.tracks.filter((t) => t.size > 0).length + '/' + L.tracks.length,
  };
  const f = document.querySelector('iframe[data-id="head"]');
  if (f) {
    const w = f.contentWindow;
    out.head总时长 = w.eval('plItems(0).CalcTotalDuration()');
    out.head总体积 = w.eval('plItems(0).CalcTotalSize()');
    out.head条数 = w.eval('plItems(0).Count');
    out.句柄CalcTotalSize = w.eval('(function(){ const it = plItems(0); const h = it.Item(0); return JSON.stringify({ id: h && h.__id, FileSize: h && h.FileSize }); })()');
  }
  return JSON.stringify(out, null, 1);
})()
