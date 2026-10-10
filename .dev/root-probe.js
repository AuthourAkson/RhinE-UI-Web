(() => {
  const out = {};
  const rt = document.querySelector('iframe[data-id="root"]');
  const w = rt && rt.contentWindow;
  out.rootShim = w ? w.eval('typeof __RHINE_SHIM__ !== "undefined" ? __RHINE_SHIM__ : "（无标记=旧版）"') : 'n/a';
  out.rootPickFn = w ? typeof w.__rhineSetPicking : 'n/a';
  out.rootCanvasCount = w ? w.document.querySelectorAll('canvas').length : -1;
  out.rootCanvases = w ? [...w.document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height} css=${c.style.width || 'auto'} z=${c.style.zIndex || '-'}`).join(' | ') : '';
  out.rootBodyStart = w ? w.document.body.innerHTML.replace(/\s+/g, ' ').slice(0, 240) : '';
  out.shimUrl = w ? (w.document.querySelector('script[src*="shim"]') || {}).src : '';
  const st = document.querySelector('iframe[data-id="stage"]');
  out.stageShim = st && st.contentWindow ? st.contentWindow.eval('typeof __RHINE_SHIM__ !== "undefined" ? __RHINE_SHIM__ : "（无标记=旧版）"') : 'n/a';
  return JSON.stringify(out, null, 1);
})()
