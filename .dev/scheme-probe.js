(() => {
  const root = document.querySelector('iframe[data-id="root"]').contentWindow;
  const ev = (e) => { try { return root.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const stage = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const evs = (e) => { try { return stage.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const errs = (window.__ERRORS || []).filter((m) => /⚠️|Error|error/.test(m));
  return JSON.stringify({
    rootScheme: ev('typeof SCHEME !== "undefined" ? SCHEME : null'),
    rootMode: ev('typeof MODE !== "undefined" ? MODE : null'),
    stageScheme: evs('typeof SCHEME !== "undefined" ? SCHEME : null'),
    accent: ev('typeof C !== "undefined" ? ("#" + (C.accent >>> 0).toString(16).slice(2)) : null'),
    bg: ev('typeof C !== "undefined" ? ("#" + (C.bg >>> 0).toString(16).slice(2)) : null'),
    hud: (document.getElementById('log') || {}).textContent,
    recentErrors: errs.slice(-3),
  }, null, 1);
})()
