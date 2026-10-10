(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  return JSON.stringify({
    selKey: ev('typeof AR.selKey !== "undefined" ? String(AR.selKey).slice(0, 44) : "undef"'),
    selAlbum: ev('(function(){ try { return AR.selAlbum ? AR.selAlbum.title : "null"; } catch(e){ return "ERR"; } })()'),
    inspOn: ev('typeof AR.inspOn !== "undefined" ? AR.inspOn : "undef"'),
    insp: ev('(function(){ try { return AR.insp ? JSON.stringify({key: String(AR.insp.a && AR.insp.a.title || ""), lift: AR.insp.lift}) : "null"; } catch(e){ return "ERR"; } })()'),
    cardTitle: ev('(function(){ try { return AR.tracks && AR.tracks.rows ? (AR.tracks.rows[0] ? AR.tracks.rows[0].title : "无行") : "无"; } catch(e){ return "ERR"; } })()'),
    hud: (document.getElementById('log') || {}).textContent,
  }, null, 1);
})()
