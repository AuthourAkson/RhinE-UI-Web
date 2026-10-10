(() => {
  const out = { at: new Date().toISOString() };
  for (const f of document.querySelectorAll('iframe')) {
    const id = f.dataset.id || '(无)';
    const r = f.getBoundingClientRect();
    const w = f.contentWindow;
    let info = {};
    try {
      const cs = [...w.document.querySelectorAll('canvas')];
      info = {
        shim: w.eval('typeof __RHINE_SHIM__ !== "undefined" ? __RHINE_SHIM__ : "旧版"'),
        pickFn: typeof w.__rhineSetPicking,
        themeWH: w.eval('typeof W !== "undefined" ? W + "x" + H : "无"'),
        canvases: cs.map((c) => {
          const cr = c.getBoundingClientRect();
          let dataLen = -1;
          try { dataLen = c.toDataURL().length; } catch (e) { }
          return `attr=${c.width}x${c.height} css=${c.style.width || "auto"} rect=${Math.round(cr.width)}x${Math.round(cr.height)} png=${dataLen}`;
        }),
      };
    } catch (e) { info.err = String(e).slice(0, 80); }
    out[id] = {
      frame: `${Math.round(r.width)}x${Math.round(r.height)} ${getComputedStyle(f).display}`,
      ...info,
    };
  }
  return JSON.stringify(out, null, 1);
})()
