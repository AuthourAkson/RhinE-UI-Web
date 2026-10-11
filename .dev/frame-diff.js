(async () => {
  // 比较两张间隔 1.5s 的截图，统计差异像素占比（证明动画在动）
  const load = async (url) => {
    const i = new Image(); i.src = url; await i.decode();
    const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0);
    return { W: i.naturalWidth, H: i.naturalHeight, d: x.getImageData(0, 0, i.naturalWidth, i.naturalHeight).data };
  };
  const A = await load('/.dev/signal-ok-1.png'), B = await load('/.dev/signal-ok-2.png');
  const W = Math.min(A.W, B.W), H = Math.min(A.H, B.H);
  let diff = 0, n = 0;
  // 分区统计：管线区（上 2/3）与迹线区（下 1/3）
  const zones = { 管线: [0, 0, W, Math.round(H * 0.68)], 迹线与其余: [0, Math.round(H * 0.68), W, H] };
  const out = {};
  for (const [name, [x0, y0, x1, y1]] of Object.entries(zones)) {
    let d = 0, c = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * A.W + x) * 4, j = (y * B.W + x) * 4;
      const delta = Math.abs(A.d[i] - B.d[j]) + Math.abs(A.d[i + 1] - B.d[j + 1]) + Math.abs(A.d[i + 2] - B.d[j + 2]);
      if (delta > 30) d++;
      c++;
    }
    out[name] = (d / c * 100).toFixed(2) + '% 像素有变化（' + d + '/' + c + '）';
  }
  return JSON.stringify(out, null, 1);
})()
