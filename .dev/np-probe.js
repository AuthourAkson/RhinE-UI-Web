(() => {
  const f = document.querySelector('iframe[data-id="stage"]');
  const w = f.contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR ' + err.message; } };
  const D = window.__RHINE_DEBUG__;
  return JSON.stringify({
    宿主: { playing: D.LIB.playing, activePlaylist: D.LIB.activePlaylist, focus: D.LIB.focus, focusTrack: D.LIB.focusTrack },
    面板看库: ev('(function(){ const L = window.__RHINE_LIBRARY__; return L ? JSON.stringify({ tracks: L.tracks.length, playing: L.playing, playlists: L.playlists.map(p => p.items.length) }) : "没有 __RHINE_LIBRARY__"; })()'),
    GetNowPlaying: ev('(function(){ const h = fb.GetNowPlaying(); return h ? JSON.stringify({ id: h.__id, path: h.Path, len: h.Length, size: h.FileSize }) : "null"; })()'),
    GetFocusItem: ev('(function(){ const h = fb.GetFocusItem(); return h ? JSON.stringify({ id: h.__id, path: h.Path }) : "null"; })()'),
    面板T_handle: ev('T && T.handle ? JSON.stringify({ path: T.handle.Path, len: T.handle.Length }) : "null"'),
    plman_Count: ev('plman.GetPlaylistItems(plman.ActivePlaylist).Count'),
    fb_IsPlaying: ev('fb.IsPlaying'),
    波形: ev('JSON.stringify({ key: Wave.key, loaded: Wave.loaded })'),
    歌词状态: ev('JSON.stringify({ state: LYR.state, has: !!T.lyrics })'),
  }, null, 1);
})()
