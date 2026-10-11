(() => {
  // 只量"纯阵列内容"区：x∈[180,360]（避开左侧 20-170 的标签/大数字、以及 x>365 的刻度尺/货架切换器）
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow;
  const cv = w.document.querySelector('canvas'), ctx = cv.getContext('2d');
  const DPR = cv.width / w.eval('W');
  const W = w.eval('W'), H = w.eval('H');
  const img = ctx.getImageData(0, 0, cv.width, cv.height), d = img.data;
  const out = [];
  const yTop = Math.round(w.eval('H - dp(170)') * DPR), yBot = Math.round(w.eval('H - dp(20)') * DPR);
  for (let y = yTop; y <= yBot; y += Math.max(1, Math.round(2 * DPR))) {
    let n = 0, sum = 0, mx = 0;
    for (let x = Math.round(180 * DPR); x < Math.round(360 * DPR); x += 2) {
      const i = (y * cv.width + x) * 4;
      const dev = Math.max(Math.abs(d[i] - 11), Math.abs(d[i + 1] - 11), Math.abs(d[i + 2] - 11));
      if (dev > 6) n++;
      sum += dev; if (dev > mx) mx = dev;
    }
    const dp = Math.round((H - y / DPR) * 10) / 10;
    out.push(`${String(Math.round(y / DPR)).padStart(4)}y ${String(dp).padStart(6)}dp  非底色=${String(n).padStart(3)}  平均偏差=${String(Math.round(sum / 90)).padStart(3)}  峰值=${mx}`);
  }
  return out.join('\n') + '\n（带子：dp139→dp59 渐变；dp60→0 纯色；渐变应当让内容平滑降到 0）';
})()
