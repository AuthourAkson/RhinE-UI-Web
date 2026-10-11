(() => {
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR ' + err.message; } };
  return JSON.stringify({
    DPR: ev('DPR'), W_H: ev('W + "x" + H'),
    // 资料卡离屏层：逻辑尺寸 vs 画布后备尺寸
    infoLayer: ev('AR.info ? { w: AR.info.w, h: AR.info.h, canvas: AR.info.img.__el.width + "x" + AR.info.img.__el.height } : "无"'),
    infoX: ev('infoX()'), arrayW: ev('arrayW()'),
    cardLogicalWidth: ev('W - infoX() + dp(20)'),
    // 磁带精灵经过 tinted() 的图像尺寸（用于判断 __dpr 方案是否会破坏它）
    fadedKeys: ev('[...ARIMG.faded.keys()].slice(0,3)'),
    // 主题里 renderLayer 的定义（确认它期望逻辑尺寸）
    renderLayerSrc: ev('typeof renderLayer === "function" ? renderLayer.toString().slice(0, 400) : "未定义"'),
  }, null, 1);
})()
