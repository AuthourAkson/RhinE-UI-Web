(async () => {
  // 把截图区域渲染成 ASCII 亮度图（模型看不了图，用字符画"看"布局）
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
        let mx = 0, n = 0;
        for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) {
          const X = Math.round(x0 + cxx * cell + xx), Y = Math.round(y0 + cy * cell + yy);
          if (X < W && Y < H) { mx = Math.max(mx, lum(X, Y)); n++; }
        }
        // 暗底(11) → 空；亮(242) → @
        const t = Math.max(0, Math.min(1, (mx - 30) / 200));
        line += chars[Math.round(t * (chars.length - 1))];
      }
      rows.push(line.replace(/\s+$/, ''));
    }
    return { url, W, H, map: rows };
  };

  // 参考图：底部带（label/数字/刻度尺区域）+ 工具栏带
  // transportTop=1022, headerBottom=110, s=1.5, infoX=1303
  const refBottom = await render('/image/archieve-%E5%8E%9F%E7%89%88.png', 20, 690, 640, 1024, 4);
  const refBar = await render('/image/archieve-%E5%8E%9F%E7%89%88.png', 560, 120, 1290, 240, 4);
  // 移植版：同样区域（transportTop=806, headerBottom=73, s=1, infoX=1098）
  const mineBottom = await render('/.dev/seed-applied.png', 13, 460, 427, 808, 3);
  const mineBar = await render('/.dev/seed-applied.png', 373, 80, 1093, 160, 3);

  const fmt = (r) => `--- ${r.url} ${r.W}x${r.H} ---\n` + r.map.join('\n');
  return fmt(refBottom) + '\n\n' + fmt(refBar) + '\n\n' + fmt(mineBottom) + '\n\n' + fmt(mineBar);
})()
