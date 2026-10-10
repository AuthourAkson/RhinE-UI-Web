(() => {
  const frames = [...document.querySelectorAll('iframe')].map((f) => {
    const r = f.getBoundingClientRect();
    return { id: f.dataset.id || f.id || '(无)', x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), style: f.getAttribute('style') || '' };
  });
  const st = document.querySelector('iframe[data-id="stage"]');
  const sw = st && st.contentWindow;
  let pickFn = 'undef', hasCanvas = 'no', canvasRect = null;
  if (sw) {
    try { pickFn = typeof sw.__rhineSetPicking; } catch (e) { pickFn = 'ERR'; }
    try {
      const c = sw.document.querySelector('canvas');
      hasCanvas = c ? 'yes' : 'no';
      if (c) { const r = c.getBoundingClientRect(); canvasRect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }
    } catch (e) { }
  }
  return JSON.stringify({
    frames: frames.filter((f) => f.w > 0 || f.h > 0).slice(0, 12),
    zeroSized: frames.filter((f) => !f.w && !f.h).map((f) => f.id),
    stage: { pickFn, hasCanvas, canvasRect },
    pickLog: (window.PICK_LOG || []).slice(-3),
    lastPick: window.__RHINE_LAST_PICK__ || null,
  }, null, 1);
})()
