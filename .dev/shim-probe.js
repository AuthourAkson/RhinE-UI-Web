(async () => {
  const txt = await (await fetch('/shim/shim.js?probe=' + Date.now())).text();
  const st = document.querySelector('iframe[data-id="stage"]');
  const rt = document.querySelector('iframe[data-id="root"]');
  return JSON.stringify({
    shimHasPicking: txt.includes('__rhineSetPicking'),
    shimHasPickListener: txt.includes('__RHINE_PICK__'),
    shimBytes: txt.length,
    stageStyle: st ? st.getAttribute('style') : null,
    stageDisplay: st ? getComputedStyle(st).display : null,
    stageVisibility: st ? getComputedStyle(st).visibility : null,
    rootStyle: rt ? rt.getAttribute('style') : null,
    rootPickFn: rt && rt.contentWindow ? typeof rt.contentWindow.__rhineSetPicking : 'n/a',
    // 谁在真正渲染？看两个面板画布的实际尺寸
    stageCanvas: (() => { try { const c = st.contentWindow.document.querySelector('canvas'); return c ? c.width + 'x' + c.height + ' css=' + c.style.width : 'none'; } catch (e) { return 'ERR'; } })(),
    rootCanvas: (() => { try { const c = rt.contentWindow.document.querySelector('canvas'); return c ? c.width + 'x' + c.height + ' css=' + c.style.width : 'none'; } catch (e) { return 'ERR'; } })(),
  }, null, 1);
})()
