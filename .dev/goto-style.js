(() => {
  // 切到 STYLE 视图（主题里 style 是第 5 个，键 5 = 0x35）
  const w = document.querySelector('iframe[data-id="root"]').contentWindow;
  const before = w.eval('STATE.view');
  w.__rhine.call('on_key_down', 0x35);
  return JSON.stringify({ from: before, to: w.eval('STATE.view') });
})()
