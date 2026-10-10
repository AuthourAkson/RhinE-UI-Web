(() => {
  const logs = window.__ERRORS || [];
  const catalog = logs.filter((m) => m.includes('曲库解析完成'));
  const renders = logs.filter((m) => m.includes('面板就绪'));
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const gen = (() => { try { return w.eval('typeof LIB !== "undefined" ? LIB.gen : -1'); } catch (e) { return 'ERR'; } })();
  const cat = w.__RHINE_CATALOG__;
  return JSON.stringify({
    catalogCount: catalog.length,
    lastCatalog: catalog.slice(-2),
    panelReadyCount: renders.length,
    themeLIBgen: gen,
    catalogTracks: cat ? cat.tracks : null,
    catalogMs: cat ? Math.round(cat.ms.index) : null,
    loops: logs.filter((m) => /索引请求排队|转发索引请求/.test(m)).length,
  }, null, 1);
})()
