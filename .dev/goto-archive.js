(() => {
  // 直接切到"档案"视图（主题里 archive = 键 1 = 0x31）
  const w = document.querySelector('iframe[data-id="root"]').contentWindow;
  const before = w.eval('STATE.view');
  if (before !== 'archive') w.__rhine.call('on_key_down', 0x31);
  return JSON.stringify({ from: before, to: w.eval('STATE.view') });
})()
