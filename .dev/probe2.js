(() => {
  const f = document.querySelector('iframe[data-id="root"]');
  if (!f) return 'no root iframe';
  const w = f.contentWindow;
  const probe = (expr) => { try { return w.eval(expr); } catch (e) { return 'ERR: ' + e.message; } };
  const out = {
    rootBox: f.style.width + ' × ' + f.style.height,
    typeofOnSize: typeof w.on_size,
    typeofOnPaint: typeof w.on_paint,
    getPanelCount: typeof w.GetPanelCount === 'function' ? w.GetPanelCount() : 'n/a',
    panel0Text: (w.GetPanelByIndex && w.GetPanelByIndex(0)) ? w.GetPanelByIndex(0).Text : null,
    panel8Text: (w.GetPanelByIndex && w.GetPanelByIndex(8)) ? w.GetPanelByIndex(8).Text : null,
    W: probe('typeof W !== "undefined" ? W : "undef"'),
    H: probe('typeof H !== "undefined" ? H : "undef"'),
    ready: probe('typeof ready !== "undefined" ? ready : "undef"'),
    CHILDREN: probe('typeof CHILDREN !== "undefined" ? CHILDREN.join(",") : "undef"'),
    Pkeys: probe('typeof P !== "undefined" ? Object.keys(P).join(",") : "undef"'),
    THEME_ROOT: probe('typeof THEME_ROOT !== "undefined" ? THEME_ROOT : "undef"'),
    Cbg: probe('typeof C !== "undefined" ? C.bg : "undef"'),
    M: probe('typeof M !== "undefined" ? JSON.stringify(M) : "undef"'),
    busState: probe('typeof STATE !== "undefined" ? JSON.stringify(STATE) : "undef"'),
  };
  // 手动触发一次 on_size，看会不会抛
  try {
    w.on_size(1600, 1000);
    out.manualSizeOk = true;
  } catch (e) { out.manualSizeError = String(e && e.stack || e).slice(0, 500); }
  out.afterManual = {
    ready: probe('typeof ready !== "undefined" ? ready : "undef"'),
    Pkeys: probe('typeof P !== "undefined" ? Object.keys(P).join(",") : "undef"'),
  };
  return JSON.stringify(out, null, 1);
})()
