(() => {
  // 量"播放栏上方那条黑带"的垂直渐变：从 stage 画布上按行取像素
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow;
  const cv = w.document.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const DPR = w.__rhine ? (cv.width / w.eval('W')) : 1;
  const H = w.eval('H'), W = w.eval('W'), aw = w.eval('arrayW()');
  const x = Math.round(Math.min(aw - 40, 200) * DPR);
  const y0 = w.eval('H - dp(160)') * DPR, y1 = w.eval('H - dp(40)') * DPR;
  const rows = [];
  for (let y = Math.round(y0); y <= Math.round(y1); y += Math.max(1, Math.round(4 * DPR))) {
    const d = ctx.getImageData(x, y, 1, 1).data;
    rows.push({ y: Math.round(y / DPR), dp: Math.round((H - y / DPR) * 10) / 10, rgb: d[0] + ',' + d[1] + ',' + d[2] });
  }
  return JSON.stringify({ x, DPR, H, 采样: rows }, null, 0);
})()
