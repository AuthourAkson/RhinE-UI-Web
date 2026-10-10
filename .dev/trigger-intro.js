(() => {
  // 模拟主题快捷键 B（frame.js: on_key_down 0x42 → startBoot()）：等价于点「PLAY INTRO」
  const w = document.querySelector('iframe[data-id="root"]').contentWindow;
  const before = w.eval('typeof fx !== "undefined" && fx ? fx.kind : null');
  w.__rhine.call('on_key_down', 0x42);
  const after = w.eval('typeof fx !== "undefined" && fx ? fx.kind : null');
  const fxPanel = document.querySelector('iframe[data-id="fx"]');
  return JSON.stringify({
    fxBefore: before,
    fxAfter: after,
    fxPanel: fxPanel.style.width + '×' + fxPanel.style.height,
    fxDisplay: fxPanel.style.display,
  }, null, 1);
})()
