(() => {
  const probePanel = (id) => {
    const f = document.querySelector(`iframe[data-id="${id}"]`);
    if (!f) return { id, error: 'no iframe' };
    const w = f.contentWindow;
    const ev = (expr) => { try { return w.eval(expr); } catch (e) { return 'ERR: ' + e.message; } };
    const cv = w.document.querySelector('canvas');
    let pixels = null;
    try {
      const ctx = cv.getContext('2d');
      const d = ctx.getImageData(0, 0, Math.min(cv.width, 40), Math.min(cv.height, 40)).data;
      let nonEmpty = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nonEmpty++;
      pixels = { sampled: d.length / 4, alphaNonZero: nonEmpty };
    } catch (e) { pixels = 'ERR ' + e.message; }
    return {
      id,
      box: f.style.width + '×' + f.style.height,
      canvas: cv ? cv.width + '×' + cv.height : null,
      pixels,
      W: ev('typeof W !== "undefined" ? W : "undef"'),
      H: ev('typeof H !== "undefined" ? H : "undef"'),
      hasPaint: ev('typeof on_paint'),
      hasSize: ev('typeof on_size'),
      probeState: ev('typeof STATE !== "undefined" ? JSON.stringify({view:STATE.view,preset:STATE.preset}) : "undef"'),
      tokensBg: ev('typeof C !== "undefined" ? C.bg : "undef"'),
    };
  };
  return JSON.stringify({
    header: probePanel('header'),
    transport: probePanel('transport'),
    manager: probePanel('manager'),
    card: probePanel('card'),
    rootState: (() => { const w = document.querySelector('iframe[data-id="root"]').contentWindow; try { return w.eval('JSON.stringify({view:STATE.view, ready:ready, W:W, H:H})'); } catch (e) { return 'ERR ' + e.message; } })(),
    panelGeometry: (window.__PANELS__ || []).map(p => ({ id: p.__id, text: p.Text, x: p.x, y: p.y, w: p.w, h: p.h, visible: p.Visible })),
  }, null, 1);
})()
