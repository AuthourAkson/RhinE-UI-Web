(async () => {
  const load = async (url) => {
    const i = new Image(); i.src = url; await i.decode();
    const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0);
    return { W: i.naturalWidth, H: i.naturalHeight, d: x.getImageData(0, 0, i.naturalWidth, i.naturalHeight).data };
  };
  const pairs = [['/.dev/pipe-1.png', '/.dev/pipe-3.png'], ['/.dev/pipe-1.png', '/.dev/pipe-2.png']];
  const out = [];
  for (const [u1, u2] of pairs) {
    const A = await load(u1), B = await load(u2);
    const W = Math.min(A.W, B.W), H = Math.min(A.H, B.H);
    const zones = { 管线区: [Math.round(W * 0.15), Math.round(H * 0.05), Math.round(W * 0.85), Math.round(H * 0.62)], 迹线区: [Math.round(W * 0.15), Math.round(H * 0.62), Math.round(W * 0.85), Math.round(H * 0.82)] };
    const r = {};
    for (const [name, [x0, y0, x1, y1]] of Object.entries(zones)) {
      let d = 0, c = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        const i = (y * A.W + x) * 4, j = (y * B.W + x) * 4;
        const delta = Math.abs(A.d[i] - B.d[j]) + Math.abs(A.d[i + 1] - B.d[j + 1]) + Math.abs(A.d[i + 2] - B.d[j + 2]);
        if (delta > 30) d++; c++;
      }
      r[name] = (d / c * 100).toFixed(2) + '%';
    }
    out.push(u1.split('/').pop() + ' vs ' + u2.split('/').pop() + ' → ' + JSON.stringify(r));
  }
  return out.join('\n');
})()
