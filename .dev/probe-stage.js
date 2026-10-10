(() => {
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const root = document.querySelector('iframe[data-id="root"]').contentWindow;
  return JSON.stringify({
    rootView: (() => { try { return root.eval('STATE.view'); } catch (e) { return 'ERR'; } })(),
    stageView: ev('typeof STATE !== "undefined" ? STATE.view : "undef"'),
    stageW: ev('typeof W !== "undefined" ? W : "undef"'),
    stageH: ev('typeof H !== "undefined" ? H : "undef"'),
    libLive: ev('typeof LIB !== "undefined" ? LIB.live : "undef"'),
    arLayout: ev('typeof AR !== "undefined" ? AR.layout : "undef"'),
    arRows: ev('typeof AR !== "undefined" ? AR.rows.size : "undef"'),
    hasPaint: ev('typeof on_paint'),
  }, null, 1);
})()
