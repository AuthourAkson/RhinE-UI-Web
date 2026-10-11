(() => {
  // 按行扫描：这条带子里"阵列内容还剩多少"（相对底色的最大偏差 + 非底色像素数）
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow;
  const cv = w.document.querySelector('canvas'), ctx = cv.getContext('2d');
  const DPR = cv.width / w.eval('W');
  const W = w.eval('W'), H = w.eval('H'), aw = w.eval('arrayW()');
  const bg = w.eval('(C.bg >>> 16 & 255) + "," + (C.bg >>> 8 & 255) + "," + (C.bg & 255)');
  const [br, bgc, bb] = bg.split(',').map(Number);
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  const out = [];
  const yTop = Math.round(w.eval('H - dp(170)') * DPR), yBot = Math.round(w.eval('H - dp(30)') * DPR);
  for (let y = yTop; y <= yBot; y += Math.max(1, Math.round(3 * DPR))) {
    let maxDev = 0, n = 0;
    for (let x = 0; x < Math.round(aw * DPR); x += Math.max(1, Math.round(2 * DPR))) {
      const i = (y * cv.width + x) * 4;
      const dev = Math.max(Math.abs(d[i] - br), Math.abs(d[i + 1] - bgc), Math.abs(d[i + 2] - bb));
      if (dev > maxDev) maxDev = dev;
      if (dev > 6) n++;
    }
    out.push(`${String(Math.round(y / DPR)).padStart(4)} (${String(Math.round((H - y / DPR) * 10) / 10).padStart(6)}dp) 最大偏差=${String(maxDev).padStart(3)}  非底色像素=${n}`);
  }
  return '底色 ' + bg + '，带子范围 dp139→dp59，纯色区 dp60→0\n' + out.join('\n');
})()
