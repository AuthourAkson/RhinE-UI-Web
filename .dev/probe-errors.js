(() => {
  // 只报告错误级别的日志（忽略正常启动信息）
  const errs = (window.__ERRORS || []).filter((m) => /⚠️|error|Error|失败|缺失/.test(m));
  const root = document.querySelector('iframe[data-id="root"]').contentWindow;
  const view = (() => { try { return root.eval('STATE.view'); } catch (e) { return 'ERR'; } })();
  const panels = (window.__PANELS__ || []).map((p) => ({ id: p.__id, box: `${p.w}×${p.h}`, visible: !!p.Visible }));
  return JSON.stringify({ view, errorCount: errs.length, errors: errs.slice(-8), panels: panels.filter((p) => p.visible).map((p) => p.id + ':' + p.box) }, null, 1);
})()
