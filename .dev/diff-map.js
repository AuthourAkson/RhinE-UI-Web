(async () => {
  // 把两张图（原版参考 / 我的同尺寸渲染）做逐像素差异，输出"差异地图" + 磁带包围盒
  const load = async (url) => {
    const img = new Image(); img.src = url; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    return { W: img.naturalWidth, H: img.naturalHeight, d: cx.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data };
  };
  const A = await load('/image/archieve-%E5%8E%9F%E7%89%88.png');      // 原版
  const B = await load('/.dev/cmp-1album-1349.png');                    // 我的
  const W = Math.min(A.W, B.W), H = Math.min(A.H, B.H);
  const lum = (o, x, y) => { const i = (y * o.W + x) * 4; return (o.d[i] + o.d[i + 1] + o.d[i + 2]) / 3; };

  // ① 差异地图（32×18 格，每格平均绝对差）
  const GX = 32, GY = 18, cw = Math.floor(W / GX), ch = Math.floor(H / GY);
  let map = '';
  const rows = [];
  for (let gy = 0; gy < GY; gy++) {
    let line = '';
    for (let gx = 0; gx < GX; gx++) {
      let s = 0, n = 0;
      for (let y = gy * ch; y < (gy + 1) * ch; y += 3) for (let x = gx * cw; x < (gx + 1) * cw; x += 3) { s += Math.abs(lum(A, x, y) - lum(B, x, y)); n++; }
      const v = s / n;
      line += v > 60 ? '@' : v > 35 ? '#' : v > 20 ? '+' : v > 10 ? ':' : v > 4 ? '.' : ' ';
    }
    rows.push(String(gy * ch).padStart(4) + ' |' + line);
  }
  // ② 磁带包围盒：在左半区、亮度>120 的像素范围（白壳）
  const box = (o, x0, x1, y0, y1) => {
    let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      if (lum(o, x, y) > 120) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; n++; }
    }
    return n ? { x: minx, y: miny, w: maxx - minx, h: maxy - miny, n } : null;
  };
  const reg = [Math.round(0.10 * W), Math.round(0.60 * W), Math.round(0.25 * H), Math.round(0.95 * H)];
  return '差异地图（左列=y像素，越右越靠画面右侧；@=差很大 空格=几乎相同）\n' +
    rows.join('\n') + '\n\n' +
    '磁带白色像素包围盒（左中区域 x' + reg[0] + '-' + reg[1] + ' y' + reg[2] + '-' + reg[3] + '，单位设备像素）:\n' +
    '  原版: ' + JSON.stringify(box(A, ...reg)) + '\n' +
    '  我的: ' + JSON.stringify(box(B, ...reg));
})()
