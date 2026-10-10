(async () => {
  // 布局对比器：对一张截图测量主题的关键几何标记
  // 标记（全部来自主题源码，dark/archive 配色）：
  //   · header 底 hairline   #30302f 全宽      → header 高度        (header.js:98, H=73dp)
  //   · transport 顶 hairline #30302f 全宽      → 播放栏上沿        (transport.js:100)
  //   · 卡片 HEAVY 横线      #f2f0ea 2dp 到右缘 → 卡片左边界 infoX  (archive.js:920, infoX=W-480dp)
  //   · 工具栏激活段亮底右缘                    → 工具栏右缘 xr     (grid.js:196, xr=infoX-56dp)
  //   · 底部带行剖面（label/大数字/刻度尺）      → 距播放栏的 dp 距离 (archive.js:792, H-150dp)
  const analyze = async (url) => {
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
    const isHair = (p) => Math.abs(p[0] - 48) <= 9 && Math.abs(p[1] - 48) <= 9 && Math.abs(p[2] - 47) <= 11;
    const isBright = (p) => p[0] > 195 && p[1] > 190 && p[2] > 180;

    // ① header 底 hairline（顶部 30% 内第一条 hair 占比>70% 的行）
    let headerBottom = -1;
    for (let y = Math.round(H * 0.02); y < H * 0.3; y++) {
      let n = 0; const x0 = Math.round(W * 0.06), x1 = Math.round(W * 0.94);
      for (let x = x0; x < x1; x++) if (isHair(px(x, y))) n++;
      if (n > (x1 - x0) * 0.7) { headerBottom = y; break; }
    }
    // ② transport 顶 hairline（60% 以下第一条全宽 hair 行）
    let transportTop = -1;
    for (let y = Math.round(H * 0.6); y < H - 2; y++) {
      let n = 0;
      for (let x = Math.round(W * 0.02); x < W * 0.98; x++) if (isHair(px(x, y))) n++;
      if (n > W * 0.85) { transportTop = y; break; }
    }
    if (headerBottom < 0 || transportTop < 0) return { url, W, H, headerBottom, transportTop, error: 'hairline 未找到' };

    // ③ 卡片 HEAVY 横线：从右缘往左的亮行程>60px，且下一行也亮（2dp 粗）
    let infoX = -1;
    const yEnd = Math.round(headerBottom + (transportTop - headerBottom) * 0.45);
    for (let y = headerBottom + 3; y < yEnd; y++) {
      let x = W - 1;
      while (x > W * 0.4 && isBright(px(x, y))) x--;
      const run = W - 1 - x;
      if (run > 60 && isBright(px(x + 2, y + 1))) { infoX = x + 1; break; }
    }
    if (infoX < 0) return { url, W, H, headerBottom, transportTop, error: '卡片横线未找到' };

    // ④ 缩放系数：infoX = W/s - 480dp（只用 x 测量，不受窗口顶部裁切影响）
    const s = W / (infoX + 480);
    // ⑤ 工具栏右缘：工具栏带内最右亮像素（x < infoX-40s）
    let barRight = -1;
    const bandTop = Math.round(headerBottom + (transportTop - headerBottom) * 0.03);
    const bandBot = Math.round(headerBottom + (transportTop - headerBottom) * 0.16);
    for (let y = bandTop; y < bandBot; y++) {
      for (let x = Math.min(W - 1, Math.round(infoX - 40 * s)); x > barRight; x--) {
        if (isBright(px(x, y))) { barRight = x; break; }
      }
    }
    // ⑥ 底部带行剖面：transportTop 之上 0..230dp，x∈[15s..230s] 的亮/灰文本像素数
    const rows = [];
    for (let y = Math.max(headerBottom + 2, Math.round(transportTop - 230 * s)); y < transportTop - 2; y++) {
      let bright = 0, muted = 0;
      for (let x = Math.round(15 * s); x < Math.min(W * 0.35, 240 * s); x++) {
        const p = px(x, y);
        if (isBright(p)) bright++;
        else if (p[0] >= 100 && p[0] <= 175 && Math.abs(p[0] - p[1]) <= 12 && Math.abs(p[1] - p[2]) <= 14) muted++;
      }
      rows.push({ y, dp: (transportTop - y) / s, bright, muted });
    }
    // 找出剖面里的"簇"（连续有内容的行段）
    const clusters = [];
    let cur = null;
    for (const r of rows) {
      if (r.bright + r.muted > 2) { if (!cur) { cur = { from: r.dp, to: r.dp, bright: 0, muted: 0 }; clusters.push(cur); } cur.to = r.dp; cur.bright += r.bright; cur.muted += r.muted; }
      else cur = null;
    }
    return {
      url, W, H, s,
      headerBottom, transportTop, infoX, barRight,
      dp: {
        header: (headerBottom + 1) / s,
        transportBand: (H - transportTop) / s,
        stage: (transportTop - headerBottom) / s,
        gap_bar_to_card: (infoX - barRight) / s,
      },
      clusters: clusters.map((c) => ({ dpFrom: Math.round(c.to), dpTo: Math.round(c.from), bright: c.bright, muted: c.muted })),
    };
  };

  const ref = await analyze('/image/archieve-%E5%8E%9F%E7%89%88.png');
  const mine = await analyze('/.dev/seed-applied.png');
  return JSON.stringify({ reference: ref, port: mine }, null, 1);
})()
