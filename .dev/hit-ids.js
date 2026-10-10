(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const ids = ['ar-group', 'ar-sort', 'ar-layout', 'ar-unit', 'ar-pick', 'ar-play', 'ar-open', 'ar-addmusic'];
  const out = {};
  for (const id of ids) out[id] = ev(`(function(){ try { const a = hits.get('${id}'); return a ? Math.round(a.x)+','+Math.round(a.y)+' '+Math.round(a.w)+'x'+Math.round(a.h)+' data='+JSON.stringify(a.data) : '（无）'; } catch(e){ return 'ERR'; } })()`);
  // 也问一下 AR.hits（外壳的四边形命中区）
  out._caseHits = ev('(function(){ try { return AR.hits.length + " 个外壳命中区"; } catch(e){ return "ERR"; } })()');
  out._view = ev('typeof STATE !== "undefined" ? STATE.view : "undef"');
  out._libUnit = ev('typeof LIB !== "undefined" ? LIB.unit : "undef"');
  return JSON.stringify(out, null, 1);
})()
