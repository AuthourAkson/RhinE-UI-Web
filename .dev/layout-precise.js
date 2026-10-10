(async () => {
  // 精确数值测量：工具栏右缘 / 标签顶 / 数字顶 / 面板高度（全部换算 dp 对比）
  const measure = async (url, sHint) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, W, H).data;
    const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const lum = (p) => (p[0] + p[1] + p[2]) / 3;
    const isHair = (p) => Math.abs(p[0] - 48) <= 9 && Math.abs(p[1] - 48) <= 9 && Math.abs(p[2] - 47) <= 11;

    // hairlines
    let headerBottom = -1;
    for (let y = Math.round(H * 0.02); y < H * 0.3; y++) {
      let n = 0; const x0 = Math.round(W * 0.06), x1 = Math.round(W * 0.94);
      for (let x = x0; x < x1; x++) if (isHair(px(x, y))) n++;
      if (n > (x1 - x0) * 0.7) { headerBottom = y; break; }
    }
    let transportTop = -1;
    for (let y = Math.round(H * 0.6); y < H - 2; y++) {
      let n = 0;
      for (let x = Math.round(W * 0.02); x < W * 0.98; x++) if (isHair(px(x, y))) n++;
      if (n > W * 0.85) { transportTop = y; break; }
    }
    // 卡片 HEAVY 线 → infoX → s
    let infoX = -1;
    const yEnd = Math.round(headerBottom + (transportTop - headerBottom) * 0.45);
    for (let y = headerBottom + 3; y < yEnd; y++) {
      let x = W - 1;
      while (x > W * 0.4 && lum(px(x, y)) > 180) x--;
      if (W - 1 - x > 60 && lum(px(x + 2, y + 1)) > 180) { infoX = x + 1; break; }
    }
    const s = (W - infoX) / 480;
    const stageTop = headerBottom + 1, stageH = transportTop - stageTop;

    // ① 工具栏最右墨迹（含 line-faint 边框，lum>25 即算墨），两行分别测
    const rowBand = (y1dp, y2dp) => {
      const ya = Math.round(stageTop + y1dp * s), yb = Math.round(stageTop + y2dp * s);
      let right = -1;
      for (let y = ya; y <= yb; y++) {
        for (let x = Math.min(W - 1, infoX - 3); x > right; x--) {
          if (lum(px(x, y)) > 25) { right = x; break; }
        }
      }
      return right;
    };
    const row1Right = rowBand(18, 48);   // LAYOUT/SHOW 行
    const row2Right = rowBand(50, 80);   // SORT/GROUP 行

    // ② 标签顶：y∈[135..165]dp, x∈[20..210]dp 内最上面的灰文本行
    let labelTop = -1;
    for (let y = Math.round(stageTop + (stageH / s - 165) * s); y < Math.round(stageTop + (stageH / s - 135) * s); y++) {
      let n = 0;
      for (let x = Math.round(20 * s); x < Math.min(210 * s, W * 0.3); x++) {
        const p = px(x, y);
        if (lum(p) > 60) n++;
      }
      if (n > 3) { labelTop = y; break; }
    }
    // ③ 数字顶：y∈[100..145]dp, x∈[15..130]dp 内亮行程 ≥ 6s 的最上行
    let numeralTop = -1;
    for (let y = Math.round(stageTop + (stageH / s - 145) * s); y < Math.round(stageTop + (stageH / s - 100) * s); y++) {
      let run = 0, best = 0;
      for (let x = Math.round(15 * s); x < Math.min(140 * s, W * 0.3); x++) {
        if (lum(px(x, y)) > 180) { run++; best = Math.max(best, run); } else run = 0;
      }
      if (best >= 6 * s) { numeralTop = y; break; }
    }
    const dpFromBottom = (y) => (y >= 0 ? Math.round((transportTop - y) / s * 10) / 10 : null);
    return {
      url: url.split('/').pop(), W, H, s: Math.round(s * 1000) / 1000,
      header_dp: Math.round((headerBottom + 1) / s * 10) / 10,
      transportBand_dp: Math.round((H - transportTop) / s * 10) / 10,
      stage_dp: Math.round(stageH / s * 10) / 10,
      infoX_dp_from_right: Math.round((W - infoX) / s * 10) / 10,
      row1: { right_px: row1Right, gap_to_card_dp: row1Right > 0 ? Math.round((infoX - row1Right) / s * 10) / 10 : null },
      row2: { right_px: row2Right, gap_to_card_dp: row2Right > 0 ? Math.round((infoX - row2Right) / s * 10) / 10 : null },
      labelTop_dp: dpFromBottom(labelTop),
      numeralTop_dp: dpFromBottom(numeralTop),
    };
  };

  const reference = await measure('/image/archieve-%E5%8E%9F%E7%89%88.png');
  const port = await measure('/.dev/seed-applied.png');
  return JSON.stringify({ reference, port }, null, 1);
})()
