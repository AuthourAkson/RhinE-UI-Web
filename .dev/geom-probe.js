(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  return JSON.stringify({
    PITCH: ev('typeof PITCH !== "undefined" ? PITCH : "undef"'),
    ROWP: ev('typeof ROWP !== "undefined" ? ROWP : "undef"'),
    SHELF_SLOTS: ev('typeof SHELF_SLOTS !== "undefined" ? SHELF_SLOTS : "undef"'),
    k: ev('(function(){ try { return Math.round(arK() * 1000) / 1000; } catch(e){ return "ERR " + e.message; } })()'),
    array_res: ev('(function(){ try { return JSON.stringify(CASE_META.array_res); } catch(e){ return "ERR"; } })()'),
    caseOnScreenW: ev('(function(){ try { return Math.round(CASE_META.array_res[0] * arK()); } catch(e){ return "ERR"; } })()'),
    caseOnScreenH: ev('(function(){ try { return Math.round(CASE_META.array_res[1] * arK()); } catch(e){ return "ERR"; } })()'),
    slotsOfRow: ev('(function(){ try { const r = AR.rows.get(AR.group); return "slots=" + r.slots + " casesWindow=" + JSON.stringify(caseWindow(r, G[AR.group])); } catch(e){ return "ERR " + e.message; } })()'),
    rowScroll: ev('(function(){ try { const r = AR.rows.get(AR.group); return JSON.stringify({ scroll: r.scroll, sel: r.sel, pos: r.pos }); } catch(e){ return "ERR"; } })()'),
    perPage: ev('typeof AR !== "undefined" && AR.per !== undefined ? AR.per : "undef"'),
    arrayW: ev('(function(){ try { return Math.round(arrayW()); } catch(e){ return "ERR"; } })()'),
    W: ev('typeof W !== "undefined" ? W : "undef"'),
    H: ev('typeof H !== "undefined" ? H : "undef"'),
  }, null, 1);
})()
