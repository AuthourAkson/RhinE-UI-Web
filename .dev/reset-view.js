(() => {
  // 把档案视图恢复成默认（前面测试点成了 GRID / ADDED），并切回阵列布局
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  ev('setLayout("array")');
  ev('setGroupBy("none")');
  ev('setSortBy("artist")');
  ev('window.Repaint()');
  return JSON.stringify({
    layout: ev('AR.layout'), groupBy: ev('LIB.groupBy'), sortBy: ev('LIB.sortBy'), unit: ev('LIB.unit'),
  });
})()
