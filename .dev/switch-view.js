(() => {
  const VIEWS = ['archive', 'playlists', 'lyrics', 'signal', 'style'];
  const w = document.querySelector('iframe[data-id="root"]').contentWindow;
  const cur = w.eval('STATE.view');
  const next = VIEWS[(VIEWS.indexOf(cur) + 1) % VIEWS.length];
  w.__rhine.call('on_key_down', 0x31 + VIEWS.indexOf(next));   // 主题的键盘命令：1–5
  const stage = document.querySelector('iframe[data-id="stage"]');
  return JSON.stringify({ from: cur, to: w.eval('STATE.view'), stage: stage.style.width + '×' + stage.style.height });
})()
