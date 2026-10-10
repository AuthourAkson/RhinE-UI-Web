(async () => {
  // 采样 stage 画布的像素，隔 2 秒再采一次，算差异比例
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const cv = w.document.querySelector('canvas');
  const sample = () => {
    const c2 = cv.getContext('2d');
    const step = 8;                                  // 每 8 像素采一个，够用且快
    const d = c2.getImageData(0, 0, cv.width, cv.height).data;
    const out = [];
    for (let y = 0; y < cv.height; y += step) {
      for (let x = 0; x < cv.width; x += step) {
        const i = (y * cv.width + x) * 4;
        out.push((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      }
    }
    return out;
  };
  const a = sample();
  await sleep(2000);
  const b = sample();
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  // 也看一下画面有没有大面积空白（布局塌陷的特征）
  let dark = 0;
  for (const v of b) if (v < 0x0a0a0a) dark++;
  return JSON.stringify({
    sampledPixels: a.length,
    changedPixels: diff,
    changePercent: +(diff / a.length * 100).toFixed(2),
    darkPercent: +(dark / a.length * 100).toFixed(1),
    verdict: diff / a.length < 0.05 ? '稳定（只有时钟/跑马灯这类局部动画）' : '仍在持续重排',
  }, null, 1);
})()
