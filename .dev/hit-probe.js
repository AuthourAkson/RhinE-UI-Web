(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  // 主题的命中区（draw.js 的 Hits）：画出所有可点区域，并报告某点命中了什么
  const areas = ev(`(function(){
    try {
      const out = [];
      // hits 是 stage 内部的 Hits() 实例；没有直接暴露变量名，就用 on_mouse_move 探不到 —— 改为列出 AR.hits
      if (typeof AR !== "undefined" && AR.hits) for (const a of AR.hits.slice(0, 12)) out.push({ id: a.id, x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.w), h: Math.round(a.h) });
      return JSON.stringify(out);
    } catch (e) { return "ERR " + e.message; }
  })()`);
  const probe = (x, y) => ev(`(function(){ try { const a = hits.at(${x}, ${y}); return a ? (a.id + " @" + Math.round(a.x) + "," + Math.round(a.y) + " " + Math.round(a.w) + "x" + Math.round(a.h)) : "无命中"; } catch (e) { return "ERR " + e.message; } })()`);
  return JSON.stringify({
    arHits: JSON.parse(areas || '[]'),
    at_400_560: probe(400, 560),
    at_380_540: probe(380, 540),
    at_420_500: probe(420, 500),
    at_450_580: probe(450, 580),
    at_350_500: probe(350, 500),
    selInfo: ev('(function(){ try { const r = [...AR.rows.values()]; return JSON.stringify({ groups: AR.group, rowsSel: r.map(x => x.sel) }); } catch (e) { return "ERR"; } })()'),
  }, null, 1);
})()
