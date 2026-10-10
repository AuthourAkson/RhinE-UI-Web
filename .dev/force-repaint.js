(() => {
  const ids = (window.__PANELS__ || []).map((p) => p.__id);
  const before = [];
  for (const id of ids) {
    const p = window.__PANELS__.find((x) => x.__id === id);
    if (!p || !p.__frame) continue;
    const cv = p.__frame.contentWindow.document.querySelector('canvas');
    if (!cv) continue;
    const d = cv.getContext('2d').getImageData(0, 0, Math.min(200, cv.width), Math.min(100, cv.height)).data;
    let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++;
    before.push({ id, alphaNonZeroInSample: lit });
  }
  // 强制所有面板重绘
  for (const p of (window.__PANELS__ || [])) {
    try { p.__frame && p.__frame.contentWindow.__rhine.repaint(); } catch (e) { }
  }
  return JSON.stringify({ before }, null, 1);
})()
