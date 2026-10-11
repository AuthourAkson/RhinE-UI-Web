(() => {
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR ' + err.message; } };
  return JSON.stringify({
    CASE_DIR: ev('CASE_DIR'), CASE_SKIN: ev('CASE_SKIN'), THEME_ROOT: ev('THEME_ROOT'),
    array_res: ev('JSON.stringify(CASE_META.array_res)'),
    array_origin: ev('JSON.stringify(CASE_META.array.origin)'),
    // 磁带精灵句柄：加载的是哪个文件？shim 认为多大？
    sprites: ev(`(function(){
      const I = arrayImages();
      const info = (im) => im ? { url: (im.__el && (im.__el.src || im.__el.currentSrc)) || '(无 el)', W: im.Width, H: im.Height, ready: !!im.__ready } : null;
      return JSON.stringify({ clear: info(I.clear), frost: info(I.frost) }, null, 1);
    })()`),
    // 导轨精灵
    rail: ev(`(function(){
      const R = railImages();
      if (!R) return 'railImages() 返回 null';
      const info = (im) => im ? { url: (im.__el && (im.__el.src || im.__el.currentSrc)) || '(无 el)', W: im.Width, H: im.Height, ready: !!im.__ready } : null;
      return JSON.stringify({ keys: Object.keys(R), front: info(R.front), mid: info(R.mid), back: info(R.back) }, null, 1);
    })()`),
    RAIL_META: ev('JSON.stringify({ res: RAIL_META && RAIL_META.res, origin: RAIL_META && RAIL_META.origin, lip: RAIL_META && RAIL_META.lip })'),
    // 画布上：磁带精灵应占的矩形（CSS px）与实际像素采样
    expectedCaseRect: ev(`(function(){
      const [Ox, Oy] = origin(), k = arK(), m = CASE_META.array, sz = CASE_META.array_res[0];
      const r = AR.rows.get(AR.group); const row = arRows()[AR.group];
      const y = (slotOf(row, r.sel) - r.scroll.x);
      const ax = CASE_META.axes;
      const sx = Ox + y * ax.y[0] * k, sy = Oy + y * ax.y[1] * k;
      const ox = sx - m.origin[0] * k, oy = sy - m.origin[1] * k;
      return JSON.stringify({ origin: [Math.round(Ox), Math.round(Oy)], slot: y, sx: Math.round(sx), sy: Math.round(sy), ox: Math.round(ox), oy: Math.round(oy), S: Math.round(sz * k) });
    })()`),
  }, null, 1);
})()
