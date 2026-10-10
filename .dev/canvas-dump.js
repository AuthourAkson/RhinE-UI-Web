(() => {
  const id = (window.__ARG__ || 'root');
  const f = document.querySelector(`iframe[data-id="${id}"]`);
  if (!f) return JSON.stringify({ id, error: 'iframe 不存在' });
  const w = f.contentWindow;
  const cs = [...w.document.querySelectorAll('canvas')];
  return JSON.stringify({
    id,
    frameRect: (() => { const r = f.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })(),
    display: getComputedStyle(f).display,
    canvases: cs.map((c) => ({ attr: `${c.width}x${c.height}`, cssW: c.style.width || 'auto', rect: (() => { const r = c.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })(), dataLen: (() => { try { return c.toDataURL().length; } catch (e) { return -1; } })() })),
    shim: w.eval('typeof __RHINE_SHIM__ !== "undefined" ? __RHINE_SHIM__ : "旧版"'),
    pickFn: typeof w.__rhineSetPicking,
    // 主题自己的画布尺寸变量
    themeWH: w.eval('typeof W !== "undefined" ? W + "x" + H : "无"'),
  }, null, 1);
})()
