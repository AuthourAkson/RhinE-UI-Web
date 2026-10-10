(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const root = document.querySelector('iframe[data-id="root"]').contentWindow;
  const evr = (e) => { try { return root.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  return JSON.stringify({
    // 主题内部状态：分组方式、当前组、选中槽位、货架行数
    groupBy: ev('typeof LIB !== "undefined" ? LIB.groupBy : "undef"'),
    rows: ev('typeof AR !== "undefined" && AR.rows ? [...AR.rows.entries()].map(([i, r]) => i + ":" + r.albums.length + "张/sel=" + r.sel).join(" | ") : "undef"'),
    arGroup: ev('typeof AR !== "undefined" ? AR.group : "undef"'),
    inspected: ev('typeof AR !== "undefined" && AR.inspect ? JSON.stringify(AR.inspect) : "undef"'),
    albums: ev('typeof LIB !== "undefined" && LIB.albums ? LIB.albums.map(a => a.title + "[" + (a.genre || "-") + "]").join(", ") : "undef"'),
    // 句柄字段检查（这是本轮修的重点）
    handleFields: ev('(function(){ try { const h = fb.GetLibraryItems().Item(0); return JSON.stringify({ RawPath: !!(h && h.RawPath), SubSong: h && h.SubSong, Path: !!(h && h.Path), Length: h && h.Length }); } catch(e){ return "ERR " + e.message; } })()'),
    sameTrackAllEqual: ev('(function(){ try { const l = fb.GetLibraryItems(); const a = l.Item(0), b = l.Item(1); return String(a.RawPath === b.RawPath) + " (两个不同曲目是否被判为相同)"; } catch(e){ return "ERR"; } })()'),
    view: evr('typeof STATE !== "undefined" ? STATE.view : "undef"'),
  }, null, 1);
})()
