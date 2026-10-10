(async () => {
  const render = async (url, x0, y0, x1, y1, cell) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, W, H).data;
    const lum = (x, y) => { const i = (y * W + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
    const chars = ' .:-=+*#%@';
    const rows = [];
    const cw = Math.round((x1 - x0) / cell), chh = Math.round((y1 - y0) / cell);
    for (let cy = 0; cy < chh; cy++) {
      let line = '';
      for (let cxx = 0; cxx < cw; cxx++) {
        let mx = 0;
        for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) {
          const X = Math.round(x0 + cxx * cell + xx), Y = Math.round(y0 + cy * cell + yy);
          if (X < W && Y < H) mx = Math.max(mx, lum(X, Y));
        }
        const t = Math.max(0, Math.min(1, (mx - 22) / 200));
        line += chars[Math.round(t * (chars.length - 1))];
      }
      rows.push(String(Math.round(y0 + cy * cell)).padStart(4) + ' |' + line.replace(/:+$/, ''));
    }
    return rows.join('\n');
  };
  // 参考图：infoX=1303, s=1.5, stageTop=111 → 工具栏右端 + 卡片左缘
  const ref = await render('/image/archieve-%E5%8E%9F%E7%89%88.png', 1100, 105, 1320, 260, 2);
  // 移植版：infoX=1098, s=1, stageTop=74
  const mine = await render('/.dev/seed-applied.png', 900, 75, 1105, 178, 2);
  return '=== 原版参考 x1100-1320（卡片左缘1303）===\n' + ref + '\n\n=== 移植版 x900-1105（卡片左缘1098）===\n' + mine;
})()
