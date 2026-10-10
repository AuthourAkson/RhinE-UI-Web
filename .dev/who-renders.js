(() => {
  const rows = [];
  for (const f of document.querySelectorAll('iframe')) {
    const id = f.dataset.id || f.id || '(无)';
    const r = f.getBoundingClientRect();
    let canvas = 'n/a', pick = 'n/a', view = 'n/a';
    try {
      const w = f.contentWindow;
      const c = w.document.querySelector('canvas');
      canvas = c ? `${c.width}x${c.height} css=${c.style.width || 'auto'}` : 'none';
      pick = typeof w.__rhineSetPicking;
      view = w.eval('typeof STATE !== "undefined" ? STATE.view : (typeof CFG !== "undefined" ? "booted" : "?")');
    } catch (e) { canvas = 'ERR'; }
    rows.push({ id, rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`, display: getComputedStyle(f).display, vis: getComputedStyle(f).visibility, canvas, pick, view });
  }
  return JSON.stringify({ frames: rows, shimFileHasPicking: '（见上一步：true）' }, null, 1);
})()
