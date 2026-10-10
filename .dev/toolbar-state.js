(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  return JSON.stringify({
    show: ev('typeof LIB !== "undefined" ? (LIB.tracks_ ? "tracks" : "albums") : "undef"'),
    unit: ev('typeof LIB !== "undefined" && LIB.unit !== undefined ? LIB.unit : "undef"'),
    layout: ev('typeof AR !== "undefined" ? AR.layout : "undef"'),
    groupBy: ev('typeof LIB !== "undefined" ? LIB.groupBy : "undef"'),
    sortBy: ev('typeof LIB !== "undefined" ? LIB.sortBy : "undef"'),
    group: ev('typeof AR !== "undefined" ? AR.group : "undef"'),
    rowCount: ev('typeof AR !== "undefined" && AR.rows ? AR.rows.size : -1'),
    rowsDetail: ev('(function(){ try { return [...AR.rows.entries()].map(([i,r]) => "行"+i+": pos.x="+(r.pos?r.pos.x:"?")+" slots="+r.slots+" 专辑数="+(typeof G!=="undefined"&&G[i]?G[i].albums.length:"?")).join(" | "); } catch(e){ return "ERR " + e.message; } })()'),
    groupNames: ev('(function(){ try { return typeof G !== "undefined" ? G.map(g => g.name + "(" + g.albums.length + ")").join(", ") : "undef"; } catch(e){ return "ERR"; } })()'),
    size: ev('(function(){ try { return W + "x" + H; } catch(e){ return "ERR"; } })()'),
  }, null, 1);
})()
