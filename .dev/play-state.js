(() => {
  const D = window.__RHINE_DEBUG__;
  const L = D.LIB;
  const playing = L.playing && L.playing.item >= 0 ? L.tracks[L.playing.item] : null;
  return JSON.stringify({
    playlists: L.playlists.map((p, i) => ({ i, name: p.name, n: p.items.length, items: p.items.slice(0, 8) })),
    activePlaylist: L.activePlaylist,
    playingTrack: playing ? { title: playing.title, album: playing.album, path: playing.path } : null,
    transport: { playing: D.SHARED.transport.playing, time: Math.round(D.SHARED.transport.time || 0), length: Math.round(D.SHARED.transport.length || 0) },
    audioPaused: D.audio.paused,
  }, null, 1);
})()
