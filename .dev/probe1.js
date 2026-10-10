(() => {
  const out = {
    hud: (document.getElementById('log') || {}).textContent || '',
    errors: window.__ERRORS || [],
    panelCount: (window.__PANELS__ || []).length,
    iframes: [],
  };
  for (const f of document.querySelectorAll('iframe.panel')) {
    const w = f.contentWindow;
    let handlers = null, canvas = null, err = null;
    try {
      if (w && w.__rhine) {
        canvas = w.document.querySelector('canvas');
        handlers = w.__rhineHandlers || null;
      }
    } catch (e) { err = e.message; }
    out.iframes.push({
      id: f.dataset.id,
      onLoad: !!w,
      booted: !!(w && w.__rhine),
      box: f.style.width + ' × ' + f.style.height,
      display: f.style.display,
      canvas: canvas ? canvas.width + '×' + canvas.height : null,
      err,
    });
  }
  const np = document.querySelector('.native-playlist');
  if (np) out.nativePlaylist = { box: np.style.width + ' × ' + np.style.height, display: np.style.display };
  return JSON.stringify(out, null, 1);
})()
