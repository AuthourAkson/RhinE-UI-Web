(async () => {
  const load = async (url) => {
    const i = new Image(); i.src = url; await i.decode();
    const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0);
    return { W: i.naturalWidth, H: i.naturalHeight, d: x.getImageData(0, 0, i.naturalWidth, i.naturalHeight).data };
  };
  const analyze = (o, name) => {
    const lum = (x, y) => { const i = (y * o.W + x) * 4; return (o.d[i] + o.d[i + 1] + o.d[i + 2]) / 3; };
    // 找"轨迹条"所在的行段（亮像素最多的那一段）
    const rowCount = [];
    for (let y = 0; y < o.H; y++) { let n = 0; for (let x = 0; x < o.W; x++) if (lum(x, y) > 60) n++; rowCount.push(n); }
    const maxRow = Math.max(...rowCount);
    // 取下半部分（避开标题文字）里亮像素行的范围
    let y0 = -1, y1 = -1;
    for (let y = Math.floor(o.H * 0.45); y < o.H; y++) { if (rowCount[y] > o.W * 0.2) { if (y0 < 0) y0 = y; y1 = y; } }
    // 每列的条高度（该列的亮像素范围）
    const cols = [];
    for (let x = 0; x < o.W; x++) {
      let top = -1, bot = -1;
      for (let y = (y0 < 0 ? 0 : y0); y <= (y1 < 0 ? o.H - 1 : y1); y++) if (lum(x, y) > 60) { if (top < 0) top = y; bot = y; }
      cols.push(top < 0 ? 0 : bot - top + 1);
    }
    const nz = cols.filter((v) => v > 0);
    // 条距：非零列的间隔（取中位数）
    const gaps = []; let last = -1;
    for (let x = 0; x < cols.length; x++) if (cols[x] > 0) { if (last >= 0) gaps.push(x - last); last = x; }
    gaps.sort((a, b) => a - b);
    const mean = nz.reduce((a, b) => a + b, 0) / Math.max(1, nz.length);
    const sd = Math.sqrt(nz.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, nz.length));
    const sorted = nz.slice().sort((a, b) => a - b), q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
    return {
      图: name, 尺寸: o.W + 'x' + o.H, 占据行: y0 + '..' + y1,
      条高: { 最小: sorted[0], p25: q(.25), 中位: q(.5), p75: q(.75), p90: q(.9), 最大: sorted[sorted.length - 1] },
      动态范围: { 均值: +mean.toFixed(1), 标准差: +sd.toFixed(2), 变异系数: +(sd / mean).toFixed(3) },
      条距: { 中位: gaps[Math.floor(gaps.length / 2)] || 0, 平均: +(gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length)).toFixed(2) },
      有内容的列占比: +(nz.length / o.W * 100).toFixed(1) + '%',
    };
  };
  const A = analyze(await load('/image/%E8%BD%A8%E8%BF%B9-%E5%8E%9F%E7%89%88.png'), '原版');
  const B = analyze(await load('/image/%E8%BD%A8%E8%BF%B9-web.png'), '网页版');
  return JSON.stringify({ 原版: A, 网页版: B }, null, 1);
})()
