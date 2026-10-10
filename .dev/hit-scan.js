(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  // 沿工具栏两行扫描命中区，列出每个按钮的实际范围
  const scan = (y) => {
    const raw = ev(`(function(){
      const out = [], seen = new Set();
      for (let x = 0; x < W; x += 2) {
        const a = hits.at(x, ${y});
        if (a && !seen.has(a.id)) { seen.add(a.id); out.push({ id: a.id, x0: Math.round(a.x), w: Math.round(a.w), y0: Math.round(a.y), h: Math.round(a.h), data: a.data }); }
      }
      return JSON.stringify(out);
    })()`);
    try { return JSON.parse(raw); } catch (e) { return raw; }
  };
  return JSON.stringify({
    DPI: ev('window.DPI'),
    SCALE: ev('typeof SCALE !== "undefined" ? SCALE : "undef"'),
    W: ev('typeof W !== "undefined" ? W : "undef"'),
    H: ev('typeof H !== "undefined" ? H : "undef"'),
    arrayW: ev('(function(){ try { return Math.round(arrayW()); } catch(e){ return "ERR"; } })()'),
    row1_y105: scan(105),
    row2_y136: scan(136),
  }, null, 1);
})()
