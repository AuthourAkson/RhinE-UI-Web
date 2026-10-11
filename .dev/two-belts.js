(() => {
  const out = { url: location.search, at: new Date().toISOString() };
  // ① 所有面板/画布的真实尺寸与可见性（谁叠在上面、谁被缩放）
  out.panels = {};
  for (const f of document.querySelectorAll('iframe')) {
    const id = f.dataset.id || '(无)';
    const r = f.getBoundingClientRect();
    const st = getComputedStyle(f);
    let c = null;
    try {
      const cv = f.contentWindow.document.querySelector('canvas');
      if (cv) { const cr = cv.getBoundingClientRect(); c = `attr=${cv.width}x${cv.height} css=${cv.style.width || 'auto'}x${cv.style.height || 'auto'} rect=${Math.round(cr.width)}x${Math.round(cr.height)}`; }
    } catch (e) { c = 'ERR'; }
    out.panels[id] = `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)} ${st.display} z=${st.zIndex} vis=${st.visibility} | canvas ${c}`;
  }
  // ② stage 面板内的主题几何
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR ' + err.message; } };
  out.stage = {
    W_H: ev('W + "x" + H'),
    DPI_SCALE: ev('window.DPI + " / " + SCALE'),
    view: ev('STATE.view'), layout: ev('AR.layout'), unit: ev('LIB.unit'), groupBy: ev('LIB.groupBy'),
    arZoom: ev('arZoom()'), arK: ev('arK()'), arrayScale: ev('STATE.arrayScale'),
    arrayW: ev('arrayW()'), infoX: ev('infoX()'), origin: ev('JSON.stringify(origin())'),
    slotsInView: ev('slotsInView()'),
    groupCount: ev('LIB.groups.length'),
    groups: ev('JSON.stringify(LIB.groups.map(g => ({ name: g.name, albums: g.albums.length })))'),
    shelves: ev('JSON.stringify(buildShelves() || SHELVES.map(s => ({ name: s.name, albums: s.albums.length, slots: s.slots, used: s.used, segs: s.segs.length })))'),
    rowsKeys: ev('JSON.stringify([...AR.rows.keys()])'),
    rowsState: ev('JSON.stringify([...AR.rows].map(([gi, r]) => ({ gi, sel: r.sel, pos: +r.pos.x.toFixed(2), scroll: +r.scroll.x.toFixed(2), cases: r.cases.size })))'),
    ARgroup: ev('AR.group'),
    albumCount: ev('LIB.albums.length'), trackCount: ev('LIB.items.length'), live: ev('LIB.live'),
  };
  return JSON.stringify(out, null, 1);
})()
