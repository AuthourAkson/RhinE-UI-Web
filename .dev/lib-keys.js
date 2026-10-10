(() => {
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f && f.contentWindow;
  if (!w) return 'stage 面板不存在';
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR ' + err.message; } };
  return JSON.stringify({
    // 演示库的专辑 key（albumDir 用反斜杠切分）
    albumKeys: ev('LIB.albums.slice(0, 8).map(a => a.key)'),
    miracleKey: ev('(LIB.items.find(t => /miracle milk/i.test(t.album || "")) || {}).album'),
    // 当前设置状态
    now: {
      view: ev('STATE.view'), unit: ev('LIB.unit'), group: ev('LIB.groupBy'),
      sort: ev('LIB.sortBy'), layout: ev('AR.layout'),
    },
    // 关键几何（stage 内）
    geom: ev('(function(){ const ix = infoX(), aw = arrayW(); return { W, H, infoX: ix, arrayW: aw, barRight: aw - dp(32), gapCardToBar: ix - (aw - dp(32)), selectLabelY: H - dp(150), dp24: dp(24) }; })()'),
    // settings 文件在 localStorage 的现状
    ls: (() => { try { const v = localStorage.getItem('rhine:file:audio-archive-settings.json'); return v ? v.slice(0, 200) : '(无)'; } catch (e) { return 'ERR'; } })(),
  }, null, 1);
})()
