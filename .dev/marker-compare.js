(async () => {
  // 在两图里找"橙色标记块"（封面四角 #ff7a01）与"亮白磁带体"的包围盒，直接对比落点
  const load = async (url) => {
    const img = new Image(); img.src = url; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    return { name: url.split('/').pop(), W: img.naturalWidth, H: img.naturalHeight, d: cx.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data };
  };
  const px = (o, x, y) => { const i = (y * o.W + x) * 4; return [o.d[i], o.d[i + 1], o.d[i + 2]]; };
  const isOrange = (p) => p[0] > 205 && p[1] > 85 && p[1] < 165 && p[2] < 70;
  const isWhite = (p) => p[0] > 225 && p[1] > 225 && p[2] > 218;

  const analyze = (o) => {
    // 左半区（阵列区），排除右侧卡片
    const x0 = 0, x1 = Math.round(o.W * 0.62), y0 = Math.round(o.H * 0.10), y1 = Math.round(o.H * 0.72);
    const blobs = [];
    const seen = new Uint8Array(o.W * o.H);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (seen[y * o.W + x]) continue;
      if (!isOrange(px(o, x, y))) continue;
      // 洪水填充收集连通块
      const stack = [[x, y]]; const cells = [];
      seen[y * o.W + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop(); cells.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1 || seen[ny * o.W + nx]) continue;
          if (isOrange(px(o, nx, ny))) { seen[ny * o.W + nx] = 1; stack.push([nx, ny]); }
        }
      }
      if (cells.length >= 6 && cells.length <= 900) {
        let sx = 0, sy = 0; for (const [cx, cy] of cells) { sx += cx; sy += cy; }
        blobs.push({ n: cells.length, x: Math.round(sx / cells.length), y: Math.round(sy / cells.length) });
      }
    }
    // 亮白包围盒（磁带壳）
    let wminx = 1e9, wmaxx = -1, wminy = 1e9, wmaxy = -1, wn = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      if (isWhite(px(o, x, y))) { wn++; if (x < wminx) wminx = x; if (x > wmaxx) wmaxx = x; if (y < wminy) wminy = y; if (y > wmaxy) wmaxy = y; }
    }
    return { blobs: blobs.sort((a, b) => a.y - b.y), white: wn ? { x: wminx, y: wminy, w: wmaxx - wminx, h: wmaxy - wminy, n: wn } : null };
  };

  const A = analyze(await load('/image/archieve-%E5%8E%9F%E7%89%88.png'));
  const B = analyze(await load('/.dev/cmp-1album-1349.png'));
  const fmt = (r) => '  橙色标记块(' + r.blobs.length + '): ' + r.blobs.map((b) => `(${b.x},${b.y})n=${b.n}`).join(' ') + '\n  亮白磁带包围盒: ' + JSON.stringify(r.white);
  return '原版(2023x1166 设备像素):\n' + fmt(A) + '\n\n移植版(2024x1166 设备像素):\n' + fmt(B);
})()
