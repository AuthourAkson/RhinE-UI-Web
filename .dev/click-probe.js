(() => {
  const root = document.querySelector('iframe[data-id="root"]').contentWindow;
  const ev = (e) => { try { return root.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const modes = (window.__PANELS__ || []).filter((p) => p.__frame).map((p) => {
    try { return p.__id + '=' + (p.__frame.contentWindow.__rhine.getMode ? p.__frame.contentWindow.__rhine.getMode() : '?'); } catch (e) { return p.__id + '=?'; }
  });
  const errs = (window.__ERRORS || []).filter((m) => /⚠️|Error|error/.test(m));
  return JSON.stringify({
    rootView: ev('typeof STATE !== "undefined" ? STATE.view : null'),
    rootMode: ev('typeof MODE !== "undefined" ? MODE : null'),
    fxKind: ev('typeof fx !== "undefined" && fx ? fx.kind : null'),
    panelModes: modes.join(' '),
    hud: (document.getElementById('log') || {}).textContent,
    recentErrors: errs.slice(-4),
  }, null, 1);
})()
