(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  return JSON.stringify({
    W: ev('typeof W !== "undefined" ? W : "undef"'),
    INFO_W: ev('typeof INFO_W !== "undefined" ? INFO_W : "undef"'),
    infoX: ev('(function(){ try { return Math.round(infoX()); } catch(e){ return "ERR"; } })()'),
    arrayW: ev('(function(){ try { return Math.round(arrayW()); } catch(e){ return "ERR"; } })()'),
    // 工具栏最右那个 toggle（LAYOUT）的右边界
    layoutRight: ev(`(function(){ try { const a = hits.get('ar-layout'); return a ? Math.round(a.x + a.w) : -1; } catch(e){ return "ERR"; } })()`),
    // 理论值：arrayW() - dp(32)
    expectedRight: ev('(function(){ try { return Math.round(arrayW() - dp(32)); } catch(e){ return "ERR"; } })()'),
    // 卡片区实际左边界（infoX）与工具栏右边界之差
    gapToolbarToCard: ev('(function(){ try { const a = hits.get("ar-layout"); return a ? Math.round(infoX() - (a.x + a.w)) : -1; } catch(e){ return "ERR"; } })()'),
    DPI: ev('window.DPI'),
    SCALE: ev('typeof SCALE !== "undefined" ? SCALE : "undef"'),
  }, null, 1);
})()
