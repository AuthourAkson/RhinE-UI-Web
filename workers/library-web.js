/**
 * library-web.js —— 网页版媒体库 worker（真 Worker，不阻塞界面）
 *
 * 职责：把磁盘上的音频文件变成主题要的数据结构。
 *
 * ⚠️ 数据契约来自原版 `themes/audio-archive/js/workers/library.js`（JSplitter 版），
 *    主题的面板侧（js/lib/library.js）会这样消费：
 *      {gen, type:'catalog', tracks:<数字>, albums:[…], items:[…], ms:{index,cache}, written:<行数>}
 *      {gen, type:'cover',  key, img, blur}
 *    其中 albums[] / items[] 的字段必须与那边完全一致（否则档案视图的货架/封面会错位），
 *    所以下面 buildAlbums() 的算法是**照搬原版**的（原版按 TitleFormat 取 18 个字段，
 *    我这里用 workers/tags.js 解析出来的标签填同样顺序的数组 v[]）。
 *
 * 与原版的差异（网页版没有的）：
 *   · 原版用 fb.TitleFormat 拿字段、utils.GetAlbumArtAsyncV2 拿封面、SQLite 做缓存；
 *     这里改成自带标签解析 + 内嵌封面解码 + 内存缓存（IndexedDB 留给下一步）。
 */

// 标签解析器：动态导入 —— 万一 tags.js 还没就位，退回"按文件名猜"（不阻塞整条管线）
let parseTags = null;
try {
  ({ parseTags } = await import('./tags.js'));
} catch (e) {
  console.warn('[library-web] workers/tags.js 不可用，改用文件名兜底：' + e.message);
}
function fallbackTags(path) {
  const name = String(path).split('\\').pop() || '';
  const stem = name.replace(/\.[^.]+$/, '');
  const ext = (name.match(/\.([^.]+)$/) || [])[1] || '';
  const low = ext.toLowerCase();
  const m = /^(\d{1,2})\s*[-. ]\s*(.+)$/.exec(stem);          // "01 - 曲名" 这种常见命名
  return {
    title: m ? m[2].trim() : stem, artist: '', albumArtist: '', album: '',
    track: m ? parseInt(m[1], 10) : 0, trackTotal: 0, disc: 0, year: '', genre: '',
    duration: 0, codec: low.toUpperCase(),
    bits: 0, rate: 0, kbps: 0, lossless: low === 'flac' || low === 'wav',
    picture: null, container: 'none',
  };
}

/* ------------------------------------------------------------------ 与原版一致的专辑分组 -- */
// 同一文件夹内 album 标签相同的曲目算一张专辑；disc 子目录算父目录（与 lib/album.js 的 albumKeyOf 规则一致）
const DISC_DIR = /^(cd|disc|disk)[\s._-]*\d+\b/i;
function albumDir(p) {
  const parts = String(p).split('\\');
  parts.pop();
  if (parts.length > 1 && DISC_DIR.test(parts[parts.length - 1])) parts.pop();
  return parts;
}
const albumKeyOf = (album, p) => album.trim().toLowerCase() + '|' + albumDir(p).join('\\').toLowerCase();
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

/** 把标签对象摊平成与原版 TitleFormat 同序的 18 个字段 */
function toVals(t, p) {
  return [
    t.album || '',                       // 0  %album%
    p,                                   // 1  %path%
    t.albumArtist || '',                 // 2  album artist
    t.artist || '',                      // 3  %artist%
    t.genre || '',                       // 4  genre
    t.year || '',                        // 5  date 前四位
    t.codec || '',                       // 6  %codec%
    String(t.bits || ''),                // 7  bits per sample
    String(t.rate || ''),                // 8  samplerate
    String(t.kbps || ''),                // 9  bitrate
    t.lossless ? '1' : '',               // 10 lossless?
    t.duration ? String(t.duration) : '',// 11 length（秒）
    String(t.disc || ''),                // 12 discnumber
    `2026-01-01 00:00:00`,               // 13 added（网页版没有"加入日期"，给个值让排序稳定）
    '0',                                 // 14 play_count
    t.title || '',                       // 15 %title%
    String(t.track || ''),               // 16 %tracknumber%
    '0',                                 // 17 subsong
  ];
}
const wordsOf = (t) => `${t.title || ''} ${t.artist || ''} ${t.albumArtist || ''}`;

/** 照搬原版 buildAlbums()：产出 { albums, tracks } */
function buildAlbums(rows, words) {
  const map = new Map(), albums = [], vals = [];
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i], key = albumKeyOf(v[0], v[1]);
    vals.push(v);
    let a = map.get(key);
    if (!a) {
      const dir = albumDir(v[1]);
      a = {
        key, artist: '', title: v[0].trim() || dir[dir.length - 1] || '', genre: '', year: '', codec: v[6],
        bits: +v[7] || 0, rate: +v[8] || 0, kbps: +v[9] || 0, lossless: v[10] === '1',
        tracks: 0, length: 0, discs: 1, added: '', plays: 0, idx: [], text: '', aa: '', artists: new Map(),
      };
      map.set(key, a);
      albums.push(a);
    }
    a.tracks++;
    if (!a.aa && v[2].trim()) a.aa = v[2].trim();
    const ar = v[3].trim();
    if (ar) a.artists.set(ar, (a.artists.get(ar) || 0) + 1);
    if (!a.genre && v[4].trim()) a.genre = v[4].trim();
    if (v[5] && (!a.year || v[5] < a.year)) a.year = v[5];
    a.length += +v[11] || 0;
    a.discs = Math.max(a.discs, parseInt(v[12]) || 1);
    if (v[13] && (!a.added || v[13] < a.added)) a.added = v[13];
    a.plays += +v[14] || 0;
    a.idx.push(i);
    a.text += ' ' + words[i];
  }
  for (const a of albums) {
    let top = '', n = 0;
    for (const [ar, c] of a.artists) if (c > n) { top = ar; n = c; }
    a.artist = a.aa || (a.artists.size <= 1 || n * 2 >= a.tracks ? top : 'Various Artists');
    delete a.aa; delete a.artists;
    a.length = Math.round(a.length);
    a.text = `${a.title} ${a.artist} ${a.genre} ${a.year}${a.text}`.toLowerCase();
  }
  albums.sort((x, y) => cmp(x.artist.toLowerCase(), y.artist.toLowerCase()) || cmp(x.year, y.year) || cmp(x.title.toLowerCase(), y.title.toLowerCase()));

  const tracks = [];
  for (const a of albums) for (const i of a.idx) {
    const v = vals[i];
    const title = v[15].trim() || v[1].split('\\').pop().replace(/\.[^.]+$/, '');
    tracks.push({
      key: 't|' + v[1].toLowerCase() + '|' + v[17], cover: a.key, album: a.key, albumTitle: a.title, title,
      artist: v[3].trim() || a.artist, genre: a.genre, year: v[5] || a.year, codec: v[6], bits: +v[7] || 0, rate: +v[8] || 0,
      kbps: +v[9] || 0, lossless: v[10] === '1', tracks: 1, length: Math.round(+v[11] || 0), discs: 1, added: v[13],
      plays: +v[14] || 0, ord: (parseInt(v[12]) || 1) * 1000 + (parseInt(v[16]) || 0), idx: [i],
      text: `${title} ${v[3]} ${a.title} ${a.artist} ${a.genre} ${v[5] || a.year} ${words[i]}`.toLowerCase(),
    });
  }
  return { albums, tracks };
}

/* ------------------------------------------------------------------------------ 封面 -- */
// 解析时把内嵌图片字节留在这里（按专辑 key），供 {type:'covers'} 按需生成缩略图
const pictures = new Map();     // albumKey -> { data: Uint8Array, mime }
const thumbCache = new Map();   // albumKey -> { thumb: ImageBitmap, blur: ImageBitmap }
const THUMB = 256, BLUR = 48;

async function squareBitmap(blob, size) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(bmp.width, bmp.height);
  const sx = Math.floor((bmp.width - s) / 2), sy = Math.floor((bmp.height - s) / 2);
  const cv = new OffscreenCanvas(size, size);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, s, s, 0, 0, size, size);
  bmp.close && bmp.close();
  return cv;
}
async function makeThumbs(pic) {
  const blob = new Blob([pic.data], { type: pic.mime || 'image/jpeg' });
  const big = await squareBitmap(blob, THUMB);
  const small = await squareBitmap(blob, BLUR);
  // 模糊版：OffscreenCanvas 的 2D 上下文支持 filter（Chrome 系）
  const cv = new OffscreenCanvas(BLUR, BLUR);
  const ctx = cv.getContext('2d');
  ctx.filter = 'blur(3px)';
  ctx.drawImage(small, 0, 0);
  ctx.filter = 'none';
  return {
    thumb: big.transferToImageBitmap(),
    blur: cv.transferToImageBitmap(),
  };
}

/* -------------------------------------------------------------------------------- 主循环 -- */
self.onmessage = async (e) => {
  const m = e.data || {};
  console.log('[库 worker] 收到命令 ' + m.cmd + ' gen=' + m.gen + (m.files ? ' 文件 ' + m.files.length : ''));
  if (m.cmd === 'index') {
    const t0 = Date.now();
    const rows = [], words = [], index = [];
    pictures.clear();
    for (const f of (m.files || [])) {
      let bytes = null;
      try {
        if (f.file) bytes = new Uint8Array(await f.file.arrayBuffer());          // File System Access
        else if (f.url) bytes = new Uint8Array(await (await fetch(f.url)).arrayBuffer());   // HTTP 提供器
      } catch (err) { /* 读不到的跳过 */ }
      if (!bytes) continue;
      let t;
      try { t = parseTags ? parseTags(bytes, f.path) : fallbackTags(f.path); } catch (err) { t = null; }
      if (!t) t = fallbackTags(f.path);
      // 标签里没有标题时用文件名兜底（tags.js 只报它读到了什么，不伪造标题）
      if (!t.title) t.title = fallbackTags(f.path).title || '';
      rows.push(toVals(t, f.path));
      words.push(wordsOf(t));
      // ⚠️ 这一项会原样挂到曲目的 t.__src 上，宿主靠它拿"可播放来源"和文件体积：
      //    url   —— HTTP 演示通道（/__music.json）
      //    file  —— File System Access 选目录时拿到的 File 对象（宿主用它生成 blob URL）
      //    size  —— 播放列表头的 "3:02:11 · 1.9 GB" 要用（漏了它总显示 0 KB）
      index.push({ path: f.path, url: f.url || null, file: f.file || null, size: f.size || 0, duration: t.duration || 0 });
      if (t.picture && t.picture.data && t.album) {
        const k = albumKeyOf(t.album, f.path);
        if (!pictures.has(k)) pictures.set(k, t.picture);
      }
    }
    const { albums, tracks } = buildAlbums(rows, words);
    // ⚠️ idx 的语义：主题拿它去索引 fb.GetLibraryItems()（宿主按 tracks 数组的顺序给出句柄），
    //    而 buildAlbums 里的 idx 是**扫描顺序**（vals 的下标）——两者在专辑排序后并不一致，
    //    不修正的话卡片会显示成"别的专辑的曲目"。所以先把扫描顺序用掉（取播放来源），再重写成新位置。
    for (const t of tracks) t.__src = index[t.idx[0]] || null;
    const byKey = new Map(albums.map((a) => [a.key, a]));
    for (const a of albums) a.idx = [];
    tracks.forEach((t, pos) => {
      const a = byKey.get(t.album);
      if (a) a.idx.push(pos);
      t.idx = [pos];
    });
    self.postMessage({
      gen: m.gen, type: 'catalog', tracks: tracks.length, albums, items: tracks,
      ms: { index: Date.now() - t0, cache: 0 }, written: 0,
      __index: index,                     // 宿主用：路径 → 可播放来源
    });
  } else if (m.cmd === 'covers') {
    for (const key of (m.keys || [])) {
      let hit = thumbCache.get(key);
      if (!hit) {
        const pic = pictures.get(key);
        if (pic) { try { hit = await makeThumbs(pic); thumbCache.set(key, hit); } catch (err) { hit = null; } }
        else { thumbCache.set(key, null); }
      }
      if (hit) self.postMessage({ gen: m.gen, type: 'cover', key, thumb: hit.thumb, blur: hit.blur }, [hit.thumb, hit.blur]);
      else self.postMessage({ gen: m.gen, type: 'cover', key, thumb: null, blur: null });
      if (hit) thumbCache.delete(key);    // ImageBitmap 已转移，缓存失效（下次重新生成）
    }
  }
};
