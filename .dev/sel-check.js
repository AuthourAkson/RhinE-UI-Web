(() => {
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f && f.contentWindow;
  if (!w) return 'stage 不存在';
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR ' + err.message; } };
  return JSON.stringify({
    selAlbum: ev('AR.selAlbum'),
    curAlbumTitle: ev('(curAlbum() || {}).title'),
    curGroup: ev('curGroup() ? curGroup().name : null'),
    groupCount: ev('arRows().length'),
    firstGroupAlbums: ev('arRows().length ? arRows()[0].albums.map(a => a.key) : []'),
  }, null, 1);
})()
