/**
 * tags.js —— 零依赖音频标签解析器（RhinE 网页版媒体库 worker 调用）
 *
 * 设计约束（改动前先看这三条）：
 *   1) 纯 ESM、无 import、无副作用：不读文件、不发网络，可直接丢进 Web Worker / Node 跑。
 *   2) 任何输入都不许抛异常。整体包在 try/catch 里；出错时返回"已经解析出来的部分 +
 *      其余字段的默认值"。宁可少给信息，也不能让媒体库因为一个坏文件整个崩掉。
 *   3) 注释解释"为什么"：字节序、位宽、编码是最容易踩坑的地方，全部标出来。
 *
 * 容器 / 编码约定：
 *   container 是"元数据实际来自哪里 + 音频容器"的诊断值：
 *     'id3v2' → 真的从 ID3v2 标签里取到了字段（id3v1 只做补空，不算主来源）
 *     'id3v1' → ID3v2 没给出任何字段，靠文件末尾 128 字节的 TAG 块取到字段
 *     'none'  → 一个可用字段都没取到（注意：文件里可能仍存在只写了 TSSE 之类的 ID3v2 空壳，
 *               那种情况报 'none'，因为我们没有"元数据来源"可报）
 *     'flac' | 'mp4' | 'ogg' → 音频容器本身（这几个容器只有一套标签体系，不需要区分）
 *   codec 只使用约定的取值集合：'MP3' | 'FLAC' | 'AAC' | 'Vorbis' | 'WAV' | 'UNKNOWN'。
 *   ALAC / Opus 等未列入集合的编码统一归到 'UNKNOWN'（lossless / bits / rate 仍如实填写），
 *   这样调用方的 switch(codec) 永远不会遇到没约定的值。
 *
 * fileName 参数只用于"字节完全认不出来时按扩展名兜底猜 codec"。
 *   **故意不用它伪造 title**：媒体库需要知道"这个文件确实没有标题"，
 *   而且上层想补文件名只需自己写 `title || basename(fileName).replace(/\.[^.]+$/, '')`。
 */

/* ================================================================ 流派表 == */

// ID3v1 的 148 个流派（含 Winamp 扩展）。TCON / gnre / ID3v1 的流派字节都靠它查表。
const GENRES = [
  'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop',
  'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap',
  'Reggae', 'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks',
  'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk', 'Fusion', 'Trance',
  'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise',
  'AlternRock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop', 'Instrumental Rock',
  'Ethnic', 'Gothic', 'Darkwave', 'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream',
  'Southern Rock', 'Comedy', 'Cult', 'Gangsta', 'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle',
  'Native American', 'Cabaret', 'New Wave', 'Psychedelic', 'Rave', 'Showtunes', 'Trailer', 'Lo-Fi',
  'Tribal', 'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock',
  'Folk', 'Folk-Rock', 'National Folk', 'Swing', 'Fast Fusion', 'Bebob', 'Latin', 'Revival',
  'Celtic', 'Bluegrass', 'Avantgarde', 'Gothic Rock', 'Progressive Rock', 'Psychedelic Rock',
  'Symphonic Rock', 'Slow Rock', 'Big Band', 'Chorus', 'Easy Listening', 'Acoustic', 'Humour',
  'Speech', 'Chanson', 'Opera', 'Chamber Music', 'Sonata', 'Symphony', 'Booty Bass', 'Primus',
  'Porn Groove', 'Satire', 'Slow Jam', 'Club', 'Tango', 'Samba', 'Folklore', 'Ballad',
  'Power Ballad', 'Rhythmic Soul', 'Freestyle', 'Duet', 'Punk Rock', 'Drum Solo', 'A Cappella',
  'Euro-House', 'Dance Hall', 'Goa', 'Drum & Bass', 'Club-House', 'Hardcore', 'Terror', 'Indie',
  'BritPop', 'Negerpunk', 'Polsk Punk', 'Beat', 'Christian Gangsta Rap', 'Heavy Metal', 'Black Metal',
  'Crossover', 'Contemporary Christian', 'Christian Rock', 'Merengue', 'Salsa', 'Thrash Metal',
  'Anime', 'Jpop', 'Synthpop',
];

// Latin-1 (0x80–0x9F) 在现实世界的 MP3 里几乎都按 Windows-1252 写。
// ID3v2 规范说这段是 ISO-8859-1（即 0x80→U+0080 控制字符），但那样解析出来是乱码，
// 所以这里按业界惯例把 0x80–0x9F 映射成 Windows-1252 的可打印字符（其余字节与 latin1 相同）。
const CP1252_HIGH = '\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F'
  + '\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178';

/* ============================================================ 基础读取器 == */
// 全部手动移位实现，不依赖 DataView/TextDecoder：保证 Worker 与 Node 行为完全一致。

const u16be = (b, o) => ((b[o] << 8) | b[o + 1]) >>> 0;

const u24be = (b, o) => ((b[o] << 16) | (b[o + 1] << 8) | b[o + 2]) >>> 0;

// >>> 0 把有符号的 32 位结果掰回无符号：b[o]<<24 在 JS 里是负数
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

const u32le = (b, o) => ((b[o + 3] << 24) | (b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) >>> 0;

const u16le = (b, o) => ((b[o + 1] << 8) | b[o]) >>> 0;

// 64 位大端 → Number。JS 的位运算只有 32 位，所以高 32 位必须用乘法换算到 2^32 量级，
// 不能用 << 32（那会直接截断成 0）。atom 长度 / 总采样数都远小于 2^53，Number 精度足够。
const u64be = (b, o) => u32be(b, o) * 4294967296 + u32be(b, o + 4);

// ID3v2 的"同步安全整数"：每字节只用低 7 位，最高位恒为 0。
// 这样整个标签里绝不会出现 0xFF 后跟 >=0xE0 的假帧同步，代价是 28 位只能表示 256MB。
const synchsafe = (b, o) => (((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f)) >>> 0;

const fourcc = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

const hasAscii = (b, o, s) => {
  for (let i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false;
  return true;
};

/* ================================================================ 解码器 == */

function decodeLatin1(b, s, e) {
  let out = '';
  for (let i = s; i < e; i++) {
    const c = b[i];
    out += (c >= 0x80 && c <= 0x9f) ? CP1252_HIGH[c - 0x80] : String.fromCharCode(c);
  }
  return out;
}

function decodeUtf16(b, s, e, littleEndian) {
  let out = '';
  for (let i = s; i + 1 < e; i += 2) {
    const c = littleEndian ? (b[i] | (b[i + 1] << 8)) : ((b[i] << 8) | b[i + 1]);
    out += String.fromCharCode(c);
  }
  return out;
}

// 手写 UTF-8：不依赖 TextDecoder（Worker 里虽然有，但自己写能保证 Node/Worker 完全一致，
// 而且遇到非法字节可以自己决定怎么降级而不是抛异常）。
function decodeUtf8(b, s, e) {
  let out = '';
  let i = s;
  while (i < e) {
    const c = b[i++];
    if (c < 0x80) { out += String.fromCharCode(c); continue; }
    let cp, need;
    if ((c & 0xe0) === 0xc0) { cp = c & 0x1f; need = 1; }
    else if ((c & 0xf0) === 0xe0) { cp = c & 0x0f; need = 2; }
    else if ((c & 0xf8) === 0xf0) { cp = c & 0x07; need = 3; }
    else { out += '\uFFFD'; continue; } // 非法首字节：i 已前进过，不会死循环
    if (i + need > e) { out += '\uFFFD'; break; } // 尾部被截断
    let bad = false;
    for (let k = 0; k < need; k++) {
      const cc = b[i + k];
      if ((cc & 0xc0) !== 0x80) { bad = true; break; }
      cp = (cp << 6) | (cc & 0x3f);
    }
    if (bad) { out += '\uFFFD'; continue; } // 续字节非法：只跳过首字节，后面继续当新字符解
    i += need;
    if (cp > 0x10ffff) { out += '\uFFFD'; continue; }
    if (cp > 0xffff) { // 补充平面必须拆成代理对，否则会出现非法 UTF-16
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

// ID3v2 文本帧首字节的编码号：0=Latin1 1=UTF-16(带BOM) 2=UTF-16BE 3=UTF-8
//   —— 1 和 2 的区别只在 BOM，最容易踩的坑是"把 UTF-16 当单字节读"导致每两个字节插一个 \0。
function decodeId3Text(b, s, e, enc) {
  if (s >= e) return '';
  if (enc === 0) return decodeLatin1(b, s, e);
  if (enc === 3) return decodeUtf8(b, s, e);
  if (enc === 1) {
    // 必须看 BOM 才能定字节序；没有 BOM 时按规范退回大端
    if (e - s >= 2 && b[s] === 0xff && b[s + 1] === 0xfe) return decodeUtf16(b, s + 2, e, true);
    if (e - s >= 2 && b[s] === 0xfe && b[s + 1] === 0xff) return decodeUtf16(b, s + 2, e, false);
    return decodeUtf16(b, s, e, false);
  }
  if (enc === 2) return decodeUtf16(b, s, e, false);
  return decodeLatin1(b, s, e); // 未知编码号按 latin1 兜底，至少不丢字节
}

// 标签里的文本必须清一遍：定长字段（ID3v1）用 \0 或空格补齐，有些写入器还会留控制字符。
function clean(s) {
  if (!s) return '';
  return String(s)
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// "1/3" → [1, 3]；只有 "1" → [1, 0]。TRCK/TPOS/trkn/disk 都走这里。
function parsePair(s) {
  const m = /^\s*(\d+)\s*(?:\/\s*(\d+))?/.exec(String(s || ''));
  if (!m) return [0, 0];
  return [parseInt(m[1], 10) || 0, parseInt(m[2], 10) || 0];
}

// TCON 可能是 "Rock"、"(17)"、"(17)Rock"、"(RX)"、"17" 五种写法，全部归一成流派名
function normaliseGenre(v) {
  const s = clean(v);
  if (!s) return '';
  const m = /^\((\d+|RX|CR)\)(.*)$/i.exec(s);
  if (m) {
    const rest = clean(m[2]);
    if (rest) return rest; // "(17)Rock" 里冒号后面的文字比编号更准
    const key = m[1].toUpperCase();
    if (key === 'RX') return 'Remix';
    if (key === 'CR') return 'Cover';
    const idx = parseInt(key, 10);
    return GENRES[idx] || '';
  }
  if (/^\d+$/.test(s)) return GENRES[parseInt(s, 10)] || ''; // 纯数字按 ID3v1 索引查表
  return s;
}

// "2024"、"2024-05-01"、"2024-05-01T10:00:00" 都取前四位年份
function yearOf(v) {
  const m = /(\d{4})/.exec(clean(v));
  return m ? m[1] : '';
}

/* ============================================================== 结果对象 == */

function emptyTags() {
  return {
    title: '', artist: '', albumArtist: '', album: '',
    track: 0, trackTotal: 0, disc: 0, year: '',
    genre: '',
    duration: 0, codec: 'UNKNOWN', bits: 0, rate: 0, kbps: 0,
    lossless: false, picture: null, container: 'none',
  };
}

// duration 统一保留 3 位小数：既避免 6.034013605442177 这种噪声，也不影响 ±1.5s 的比对
const round3 = (n) => (Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : 0);

// 只保留更优的封面：type 3 = 正封面。有些写入器（例如 ffmpeg 的 FLAC 封装）把封面标成 type 0，
// 所以策略是"先到先用，但遇到 type 3 就无条件替换"。
function setPicture(tags, mime, data, picType) {
  if (!data || !data.length) return;
  if (tags.picture && !(picType === 3)) return;
  tags.picture = { mime: mime || 'application/octet-stream', data };
}

// 从 buffer 里切出图片字节。这里用 slice（复制）而不是 subarray（视图）：
// 视图会让调用方为了留住一张 20KB 的封面而一直持有整个几百 MB 的文件缓冲区。
function sliceBytes(b, s, e) {
  return b.slice(s, e);
}

/* ============================================================ ID3v2 解析 == */

// 关心的文本帧 → 我们的字段名。v2.2 用 3 字符 ID，v2.3/2.4 用 4 字符，两套都列上。
const ID3_TEXT = {
  TIT2: 'title', TT2: 'title',
  TPE1: 'artist', TP1: 'artist',
  TALB: 'album', TAL: 'album',
  TPE2: 'albumArtist', TP2: 'albumArtist',
  TCON: 'genre', TCO: 'genre',
};

// 反同步：写入器为了不产生 0xFF 0xE0 这种假同步，会把 0xFF 后面插一个 0x00，
// 读的时候要把 0xFF 00 还原成 0xFF（注意 0xFF 00 00 要还原成 0xFF 00）。
function deUnsynchronise(b, s, e) {
  const out = [];
  for (let i = s; i < e; i++) {
    out.push(b[i]);
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return Uint8Array.from(out);
}

// 在 UTF-16 描述字段里找终止符：00 00 必须落在偶数字节偏移上，
// 否则 "A\0\0B" 这种内容会被提前截断（UTF-16LE 里字符本身带 \0）。
function terminatorEnd(d, from, enc) {
  if (enc === 1 || enc === 2) {
    for (let i = from; i + 1 < d.length; i += 2) {
      if (d[i] === 0 && d[i + 1] === 0) return i + 2;
    }
    return d.length;
  }
  for (let i = from; i < d.length; i++) if (d[i] === 0) return i + 1;
  return d.length;
}

function parseApic(d, version, tags) {
  const enc = d[0];
  let mime, p;
  if (version === 2) {
    // ID3v2.2 的 PIC 帧：图片格式写死 3 个字符（JPG/PNG/-->），没有 MIME
    const fmt = String.fromCharCode(d[1], d[2], d[3]).toUpperCase();
    mime = fmt === 'JPG' ? 'image/jpeg' : (fmt === 'PNG' ? 'image/png' : '');
    p = 4;
  } else {
    const z = d.indexOf(0, 1); // MIME 永远是 latin1 且以 \0 结尾
    const end = z < 0 ? d.length : z;
    mime = decodeLatin1(d, 1, end).toLowerCase();
    p = end + 1;
  }
  const picType = d[p] || 0;
  p += 1;
  p = terminatorEnd(d, p, enc); // 跳过描述
  if (mime === '-->' || !mime || mime === 'image/') return; // "-->" 表示外链，没有内嵌字节
  if (p >= d.length) return;
  setPicture(tags, mime, sliceBytes(d, p, d.length), picType);
}

// 解析 ID3v2.2 / 2.3 / 2.4。返回标签占总字节数（音频从哪里开始）。
// 任何一步不合法都直接停下并返回当前位置 —— 绝不能因为标签烂了就抛异常。
function parseId3v2(b, tags) {
  if (b.length < 10 || !hasAscii(b, 0, 'ID3')) return 0;
  const major = b[3];
  if (major < 2 || major > 4) return 0;
  const flags = b[5];
  const size = synchsafe(b, 6);
  // 声明的大小可能超过实际文件长度（截断文件），一律夹到缓冲区末尾
  let tagEnd = Math.min(b.length, 10 + size);
  if (flags & 0x10) tagEnd = Math.min(b.length, tagEnd + 10); // v2.4 页脚也算在标签里
  const end = tagEnd;

  let data = b;
  let base = 10; // 帧区在 data 里的起始偏移
  if (flags & 0x80 && major < 4) {
    // v2.2/2.3 的反同步是"整个标签"级别的，所以在解帧之前先整体还原。
    // 注意：还原后得到的是**只含标签体**的新数组，偏移基准从 10 变成 0，
    // 这里如果还接着用 10 去找帧头，第一个帧就会被整段跳过。
    data = deUnsynchronise(b, 10, end);
    base = 0;
  }

  let o = base;
  // 有反同步时 data 是新数组（索引与 b 不再一一对应），此时边界只能用 data.length；
  // 没有反同步时用 tagEnd，避免把标签后面的音频数据当帧读。
  const limit = data === b ? end : data.length;
  if (flags & 0x40 && o + 4 <= limit) {
    // 扩展头：v2.3 的长度不含自己那 4 字节，v2.4 的含（还要按同步安全读）
    const extSize = major === 4 ? synchsafe(data, o) : u32be(data, o) + 4;
    if (extSize > 0 && o + extSize <= limit) o += extSize;
  }

  while (o + (major === 2 ? 6 : 10) <= limit) {
    let id, fsize, fflags = 0;
    if (major === 2) {
      id = String.fromCharCode(data[o], data[o + 1], data[o + 2]);
      fsize = u24be(data, o + 3);
      o += 6;
    } else {
      id = fourcc(data, o);
      fsize = major === 4 ? synchsafe(data, o + 4) : u32be(data, o + 4);
      fflags = u16be(data, o + 8);
      o += 10;
    }
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break; // 全 0 填充区，标签结束
    if (fsize <= 0 || o + fsize > limit) break; // 越界帧：不再相信后面的内容
    let body = data.subarray(o, o + fsize);
    o += fsize;

    if (major === 4 && (fflags & 0x0002)) body = deUnsynchronise(body, 0, body.length); // v2.4 逐帧反同步
    if (major === 4 && (fflags & 0x0001) && body.length >= 4) body = body.subarray(synchsafe(body, 0)); // 数据长度指示器

    if (id === 'APIC' || id === 'PIC') { parseApic(body, major, tags); continue; }

    // 文本帧：第 1 字节是编码号，后面才是文本
    if (ID3_TEXT[id]) {
      const v = clean(decodeId3Text(body, 1, body.length, body[0]));
      if (!v) continue;
      if (ID3_TEXT[id] === 'genre') tags.genre = tags.genre || normaliseGenre(v);
      else tags[ID3_TEXT[id]] = tags[ID3_TEXT[id]] || v; // 同一字段多帧时保留第一帧
      continue;
    }
    if (id === 'TRCK' || id === 'TRK') {
      const [n, t] = parsePair(decodeId3Text(body, 1, body.length, body[0]));
      tags.track = tags.track || n;
      tags.trackTotal = tags.trackTotal || t;
      continue;
    }
    if (id === 'TPOS' || id === 'TPA') {
      const [n] = parsePair(decodeId3Text(body, 1, body.length, body[0]));
      tags.disc = tags.disc || n;
      continue;
    }
    if (id === 'TYER' || id === 'TYE' || id === 'TDRC' || id === 'TDAT') {
      const y = yearOf(decodeId3Text(body, 1, body.length, body[0]));
      tags.year = tags.year || y; // TDRC(v2.4) 与 TYER(v2.3) 谁先出现用谁
      continue;
    }
    // TXXX 是自定义键值对，ALBUMARTIST 经常藏在里面（iTunes / foobar2000 都这么干）
    if (id === 'TXXX' || id === 'TXX') {
      const enc = body[0];
      const descEnd = terminatorEnd(body, 1, enc);
      const key = clean(decodeId3Text(body, 1, descEnd - (enc === 1 || enc === 2 ? 2 : 1), enc)).toUpperCase().replace(/[\s_-]/g, '');
      if (key === 'ALBUMARTIST' || key === 'ALBUMARTISTSORT' || key === 'BAND') {
        const v = clean(decodeId3Text(body, descEnd, body.length, enc));
        if (key !== 'ALBUMARTISTSORT') tags.albumArtist = tags.albumArtist || v;
      }
    }
  }
  return end;
}

/* ============================================================ ID3v1 解析 == */

// 文件末尾固定 128 字节：TAG + 标题30 + 艺术家30 + 专辑30 + 年份4 + 注释30 + 流派1。
// 这只有 MP3 才有（其他格式尾部是音频数据，误判会把随机字节当标题），所以只在 MP3 路径调用。
function parseId3v1(b, tags) {
  const n = b.length;
  if (n < 128 || !hasAscii(b, n - 128, 'TAG')) return false;
  const s = n - 128;
  tags.title = tags.title || clean(decodeLatin1(b, s + 3, s + 33));
  tags.artist = tags.artist || clean(decodeLatin1(b, s + 33, s + 63));
  tags.album = tags.album || clean(decodeLatin1(b, s + 63, s + 93));
  tags.year = tags.year || yearOf(decodeLatin1(b, s + 93, s + 97));
  // ID3v1.1 的约定：注释第 29 字节为 0、第 30 字节非 0 时，第 30 字节是音轨号；
  // 否则整段 30 字节都是注释（我们不留 comment 字段，这里只是说明两种情况都合法）。
  if (b[s + 125] === 0 && b[s + 126] !== 0) tags.track = tags.track || b[s + 126];
  const g = b[s + 127];
  tags.genre = tags.genre || (GENRES[g] || '');
  return true;
}

/* ============================================================== MP3 / MPEG == */

// 比特率表（kbps）。索引 0 = free、15 = bad，其余按表取；MPEG2/2.5 的表完全不同，别混用。
const BITRATE = {
  1: { 1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
       2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
       3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] },
  2: { 1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
       2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
       3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] },
};
const SAMPLE_RATE = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };
const SAMPLES_PER_FRAME = { 1: { 1: 384, 2: 1152, 3: 1152 }, 2: { 1: 384, 2: 1152, 3: 576 }, 2.5: { 1: 384, 2: 1152, 3: 576 } };

// 读一个 MPEG 音频帧头（4 字节）。返回 null 表示这不是一个合法帧头。
function readFrameHeader(b, o) {
  if (o + 4 > b.length) return null;
  if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
  const verBits = (b[o + 1] >> 3) & 0x03; // 0=MPEG2.5 1=保留 2=MPEG2 3=MPEG1
  const layerBits = (b[o + 1] >> 1) & 0x03; // 0=保留 1=Layer3 2=Layer2 3=Layer1
  if (verBits === 1 || layerBits === 0) return null;
  const version = verBits === 3 ? 1 : (verBits === 2 ? 2 : 2.5);
  const layer = 4 - layerBits; // 1/2/3
  const brIndex = (b[o + 2] >> 4) & 0x0f;
  const srIndex = (b[o + 2] >> 2) & 0x03;
  if (brIndex === 0 || brIndex === 15 || srIndex === 3) return null; // free/bad/保留值都不认
  const table = BITRATE[version === 1 ? 1 : 2][layer];
  const bitrate = table[brIndex] * 1000;
  const sampleRate = SAMPLE_RATE[version][srIndex];
  if (!bitrate || !sampleRate) return null;
  const padding = (b[o + 2] >> 1) & 0x01;
  const channelMode = (b[o + 3] >> 6) & 0x03; // 3 = 单声道
  const spf = SAMPLES_PER_FRAME[version][layer];
  // 帧长公式：Layer1 按 4 字节槽算，Layer2/3 按 8 位采样数算；padding 槽要加进去
  const frameLen = layer === 1
    ? (Math.floor((12 * bitrate) / sampleRate) + padding) * 4
    : Math.floor((spf / 8) * bitrate / sampleRate) + padding;
  return { version, layer, bitrate, sampleRate, padding, channelMode, spf, frameLen, mono: channelMode === 3 };
}

// 从 from 开始找第一个合法帧头。扫描上限 64KB：万一文件里全是垃圾，
// 也不能为了找一个帧头把整个几百 MB 的文件跑一遍。
const SCAN_LIMIT = 65536;
function findFrame(b, from, to) {
  const stop = Math.min(to, from + SCAN_LIMIT);
  for (let i = from; i + 4 <= stop; i++) {
    if (b[i] !== 0xff) continue;
    const h = readFrameHeader(b, i);
    if (h) return { offset: i, header: h };
  }
  return null;
}

// Xing/Info/VBRI 是塞在第一个音频帧里的"真·时长"信息，比按文件大小估算靠谱得多。
// 偏移量取决于声道数：MPEG1 单声道边信息 17 字节、立体声 32 字节；MPEG2 分别是 9 / 17。
function readVbrHeader(b, frameOffset, h) {
  const side = (h.version === 1 ? (h.mono ? 17 : 32) : (h.mono ? 9 : 17));
  const o = frameOffset + 4 + side;
  if (o + 8 > b.length) return null;
  const tag = fourcc(b, o);
  if (tag === 'Xing' || tag === 'Info') {
    const flags = u32be(b, o + 4);
    let p = o + 8;
    const out = { marker: tag, frames: 0, bytes: 0 };
    if (flags & 0x01) { out.frames = u32be(b, p); p += 4; }
    if (flags & 0x02) { out.bytes = u32be(b, p); p += 4; }
    return out;
  }
  // Fraunhofer VBRI 固定放在帧头后 32 字节处，与声道数无关
  const v = frameOffset + 4 + 32;
  if (v + 26 <= b.length && hasAscii(b, v, 'VBRI')) {
    return { marker: 'VBRI', bytes: u32be(b, v + 10), frames: u32be(b, v + 14) };
  }
  return null;
}

// MP3：ID3v2（可选）→ 第一个 MPEG 帧 → ID3v1（可选）
function parseMpeg(b, tags) {
  const tagEnd = hasAscii(b, 0, 'ID3') ? parseId3v2(b, tags) : 0;
  const hadId3v2Fields = hasFields(tags); // 必须在读 ID3v1 之前拍快照，否则分不清字段是谁给的
  const hasV1 = hasAscii(b, b.length - 128, 'TAG'); // 尾部 128 字节若为 TAG 块，它不算音频
  const audioEnd = hasV1 ? b.length - 128 : b.length;

  tags.codec = 'MP3'; // 有 ID3v2 / 找到 MPEG 帧，就可以确定是 MP3
  tags.lossless = false;
  tags.bits = 0; // MP3 是有损格式，"位深"没有意义，给 0 而不是编一个 16

  const found = findFrame(b, tagEnd, audioEnd);
  if (found) {
    const h = found.header;
    tags.rate = h.sampleRate;
    const vbr = readVbrHeader(b, found.offset, h);
    let duration = 0;
    if (vbr && vbr.frames > 0) duration = (vbr.frames * h.spf) / h.sampleRate; // 帧数×每帧采样数，对 VBR 也准
    if (!duration) {
      // CBR 估算：音频区字节数 ÷ 第一帧的比特率。VBR 没写 Xing 时会偏，
      // 但这是"能给出一个数量级正确值"和"直接给 0"之间的取舍，上层用 duration 排序足够。
      const audioBytes = Math.max(0, audioEnd - found.offset);
      duration = (audioBytes * 8) / h.bitrate;
    }
    tags.duration = round3(duration);
    // VBR（Xing 标记 / VBRI）报平均码率；CBR（含 Info 标记）直接报帧头里的标称码率
    const isVbr = vbr && (vbr.marker === 'Xing' || vbr.marker === 'VBRI');
    tags.kbps = (isVbr && vbr.bytes > 0 && duration > 0)
      ? Math.round((vbr.bytes * 8) / duration / 1000)
      : Math.round(h.bitrate / 1000);
  }
  // 找不到帧头就什么都不填（截断文件），时长宁可为 0 也不瞎猜

  if (hasV1) parseId3v1(b, tags); // ID3v1 只负责补 ID3v2 没给的字段
  // container 回答的是"元数据实际来自哪里"：
  //   ID3v2 给出了字段 → 'id3v2'；只有 ID3v1 补上了 → 'id3v1'；一个字段都没有 → 'none'
  // 注意后一种情况在现实中很常见：ffmpeg 给每个 MP3 都写一个只含 TSSE（编码器名）的
  // ID3v2 空壳，那玩意儿没有任何可用字段，报 'id3v2' 只会让人误以为标签读到了。
  tags.container = hadId3v2Fields ? 'id3v2' : (hasFields(tags) ? 'id3v1' : 'none');
}

// 有没有读到"任何"可用字段。用来判断标签到底有没有产出，以及容器该怎么报。
function hasFields(t) {
  return !!(t.title || t.artist || t.albumArtist || t.album || t.track
    || t.trackTotal || t.disc || t.year || t.genre || t.picture);
}

/* ================================================================== FLAC == */

const FLAC_KEYS = {
  TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', ALBUMARTIST: 'albumArtist',
  'ALBUM ARTIST': 'albumArtist', TRACKNUMBER: 'track', TRACKTOTAL: 'trackTotal',
  TOTALTRACKS: 'trackTotal', DISCNUMBER: 'disc', DATE: 'year', YEAR: 'year', GENRE: 'genre',
};

// Vorbis comment：小端长度前缀的 UTF-8 "KEY=VALUE" 列表（FLAC 与 OGG 共用同一套结构）
function parseVorbisComment(d, tags) {
  if (d.length < 8) return;
  let o = 0;
  const vlen = u32le(d, o); o += 4;
  if (vlen > d.length - o) return; // 长度字段离谱 → 整个注释块不可信
  o += vlen; // 厂商串（"reference libFLAC ..."），不用
  if (o + 4 > d.length) return;
  const count = u32le(d, o); o += 4;
  for (let i = 0; i < count && o + 4 <= d.length; i++) {
    const len = u32le(d, o); o += 4;
    if (len > d.length - o) break;
    const line = decodeUtf8(d, o, o + len);
    o += len;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().toUpperCase();
    const val = clean(line.slice(eq + 1));
    if (!val) continue;
    const field = FLAC_KEYS[key];
    if (field === 'track' || field === 'disc') {
      const [n, t] = parsePair(val);
      tags[field] = tags[field] || n;
      if (field === 'track') tags.trackTotal = tags.trackTotal || t;
    } else if (field === 'trackTotal') {
      tags.trackTotal = tags.trackTotal || (parseInt(val, 10) || 0);
    } else if (field === 'year') {
      tags.year = tags.year || yearOf(val);
    } else if (field === 'genre') {
      tags.genre = tags.genre || normaliseGenre(val);
    } else if (field) {
      if (!tags[field]) tags[field] = val;
    }
  }
}

function parseFlac(b, tags) {
  tags.codec = 'FLAC';
  tags.container = 'flac';
  tags.lossless = true;
  let o = 4; // 跳过 'fLaC'
  // 元数据块：1 字节（末块标志 1 位 + 类型 7 位）+ 3 字节大端长度
  while (o + 4 <= b.length) {
    const head = b[o];
    const last = (head & 0x80) !== 0;
    const type = head & 0x7f;
    const len = u24be(b, o + 1);
    const s = o + 4;
    const e = Math.min(b.length, s + len);
    if (len > b.length - s) {
      // 声明长度超出文件：截断文件。能用的部分照用，然后收工
      if (type === 0 && e - s >= 18) readStreamInfo(b, s, tags);
      break;
    }
    if (type === 0) readStreamInfo(b, s, tags);
    else if (type === 4) parseVorbisComment(b.subarray(s, e), tags);
    else if (type === 6) readFlacPicture(b.subarray(s, e), tags);
    o = e;
    if (last) break;
  }
  return o;
}

// STREAMINFO 是 34 字节定长块，里面把"总采样数"写死了 —— FLAC 的时长可以做到零误差
function readStreamInfo(b, s, tags) {
  if (s + 18 > b.length) return;
  // 前 10 字节是最小/最大块长与帧长（音频编码用，与标签无关），采样信息从第 10 字节开始
  tags.rate = (b[s + 10] << 12) | (b[s + 11] << 4) | (b[s + 12] >> 4); // 20 位采样率
  // 通道数 3 位（+1）、位深 5 位（+1）、总采样数 36 位 —— 三个字段跨字节，只能按位拼
  tags.bits = (((b[s + 12] & 0x01) << 4) | (b[s + 13] >> 4)) + 1;
  const total = (b[s + 13] & 0x0f) * 4294967296
    + u32be(b, s + 14);
  if (tags.rate > 0 && total > 0) tags.duration = round3(total / tags.rate);
}

// PICTURE 块：所有长度都是大端 u32；图片字节在最前和最后各有一个长度前缀，很容易数错。
// 布局：type(4) mimeLen(4) mime  descLen(4) desc  width(4) height(4) depth(4) colors(4) dataLen(4) data
function readFlacPicture(d, tags) {
  if (d.length < 32) return;
  const picType = u32be(d, 0);
  let o = 8; // 已经吃掉 type(4) 与 mimeLen(4)
  const mimeLen = u32be(d, 4);
  if (o + mimeLen > d.length) return;
  const mime = decodeLatin1(d, o, o + mimeLen).toLowerCase();
  o += mimeLen;
  if (o + 4 > d.length) return;
  const descLen = u32be(d, o); o += 4 + descLen;
  o += 16; // width/height/depth/colors 各 4 字节（标签用不到，但要跳过 —— 写成 20 会把图片前 4 字节吃掉）
  if (o + 4 > d.length) return;
  const dataLen = u32be(d, o); o += 4;
  if (o >= d.length) return;
  setPicture(tags, mime, sliceBytes(d, o, Math.min(d.length, o + dataLen)), picType);
}

/* ================================================================ MP4 / M4A == */

// 遍历 [s,e) 里的同级 atom。size==1 表示后面 8 字节才是真实长度（大文件），size==0 表示一直到结尾。
function atomChildren(b, s, e) {
  const out = [];
  let o = s;
  let guard = 0;
  while (o + 8 <= e && guard++ < 4096) {
    let size = u32be(b, o);
    const type = fourcc(b, o + 4);
    let head = 8;
    if (size === 1) {
      if (o + 16 > e) break;
      size = u64be(b, o + 8);
      head = 16;
    } else if (size === 0) {
      size = e - o;
    }
    // size < head 或越界都说明 atom 链断了：停在最后一个完好 atom
    if (size < head || o + size > e) break;
    out.push({ type, start: o + head, end: o + size });
    o += size;
  }
  return out;
}

const pickAtom = (list, type) => {
  for (let i = 0; i < list.length; i++) if (list[i].type === type) return list[i];
  return null;
};

// 沿 atom 路径下钻。meta 是 FullBox：内容前面多 4 字节 version/flags，必须跳过。
function findAtom(b, s, e, path) {
  let nodes = atomChildren(b, s, e);
  let node = null;
  for (let i = 0; i < path.length; i++) {
    node = pickAtom(nodes, path[i]);
    if (!node) return null;
    const skip = path[i] === 'meta' ? 4 : 0;
    nodes = atomChildren(b, node.start + skip, node.end);
  }
  return node;
}

// ilst 里每个条目是一个 atom（类型就是键名），内容里装一个 data atom。
// data：4 字节 version+类型标志（低 24 位才是类型）、4 字节 locale、然后才是载荷。
const ITEM_TITLE = '\u00A9nam';
const ITEM_ARTIST = '\u00A9ART';
const ITEM_ALBUM_ARTIST = 'aART';
const ITEM_ALBUM = '\u00A9alb';
const ITEM_DAY = '\u00A9day';
const ITEM_GENRE = '\u00A9gen';

function parseIlst(b, ilst, tags) {
  for (const item of atomChildren(b, ilst.start, ilst.end)) {
    const data = pickAtom(atomChildren(b, item.start, item.end), 'data');
    if (!data || data.end - data.start < 8) continue;
    const dtype = u32be(b, data.start) & 0x00ffffff;
    const p = data.start + 8; // version+flags(4) + locale(4)
    const len = data.end - p;
    if (len <= 0) continue;
    // 文本类型：0=隐式(当 UTF-8 处理) 1=UTF-8 2=UTF-16BE。别的类型（图片、整数）不进文本分支，
    // 否则 ©nam 万一被写成二进制，会解得满屏乱码。
    const isText = dtype <= 2;
    const text = () => (dtype === 2 ? decodeUtf16(b, p, data.end, false) : decodeUtf8(b, p, data.end));
    switch (item.type) {
      case ITEM_TITLE: if (isText) tags.title = tags.title || clean(text()); break;
      case ITEM_ARTIST: if (isText) tags.artist = tags.artist || clean(text()); break;
      case ITEM_ALBUM_ARTIST: if (isText) tags.albumArtist = tags.albumArtist || clean(text()); break;
      case ITEM_ALBUM: if (isText) tags.album = tags.album || clean(text()); break;
      case ITEM_DAY: if (isText) tags.year = tags.year || yearOf(text()); break;
      case ITEM_GENRE: if (isText) tags.genre = tags.genre || normaliseGenre(text()); break;
      case 'gnre': {
        // 老写法：2 字节大端的 ID3v1 流派索引，而且是 1-based（1 = Blues）
        if (len >= 2) {
          const idx = u16be(b, p) - 1;
          tags.genre = tags.genre || (GENRES[idx] || '');
        }
        break;
      }
      case 'trkn':
        // 载荷：2 字节保留 + 音轨号(2) + 总音轨数(2) + 2 字节保留
        if (len >= 4) tags.track = tags.track || u16be(b, p + 2);
        if (len >= 6) tags.trackTotal = tags.trackTotal || u16be(b, p + 4);
        break;
      case 'disk':
        // 载荷：2 字节保留 + 碟号(2) + 总碟数(2)
        if (len >= 4) tags.disc = tags.disc || u16be(b, p + 2);
        break;
      case 'covr':
        // covr 用 data 的类型位区分图片格式：13=JPEG 14=PNG
        if (dtype === 13) setPicture(tags, 'image/jpeg', sliceBytes(b, p, data.end), 3);
        else if (dtype === 14) setPicture(tags, 'image/png', sliceBytes(b, p, data.end), 3);
        break;
      default: break;
    }
  }
}

function parseMp4(b, tags) {
  tags.container = 'mp4';
  tags.codec = 'UNKNOWN'; // 真正编码从 stsd 里读；读不到就不冒充 AAC
  const top = atomChildren(b, 0, b.length);
  const moov = pickAtom(top, 'moov');
  if (!moov) return; // moov 在文件尾部而文件被截断 → 只留容器信息，不猜时长
  const mvhd = pickAtom(atomChildren(b, moov.start, moov.end), 'mvhd');
  if (mvhd) {
    // mvhd 有 v0/v1 两个版本，v1 的时间字段是 8 字节，读错会得到天文数字的时长
    const version = b[mvhd.start];
    const scale = version === 1 ? u32be(b, mvhd.start + 20) : u32be(b, mvhd.start + 12);
    const dur = version === 1 ? u64be(b, mvhd.start + 24) : u32be(b, mvhd.start + 16);
    if (scale > 0 && dur > 0) tags.duration = round3(dur / scale);
  }
  // iTunes 风格标签挂在 moov/udta/meta/ilst；少数文件把 meta 直接放在 moov 下，两种都试
  const udta = pickAtom(atomChildren(b, moov.start, moov.end), 'udta');
  const meta = (udta && pickAtom(atomChildren(b, udta.start, udta.end), 'meta'))
    || pickAtom(atomChildren(b, moov.start, moov.end), 'meta');
  if (meta) {
    const ilst = pickAtom(atomChildren(b, meta.start + 4, meta.end), 'ilst');
    if (ilst) parseIlst(b, ilst, tags);
  }
  // 编码与采样信息在 moov/trak/mdia/minf/stbl/stsd 的第一个采样条目里
  for (const trak of atomChildren(b, moov.start, moov.end)) {
    if (trak.type !== 'trak') continue;
    const stsd = findAtom(b, trak.start, trak.end, ['mdia', 'minf', 'stbl', 'stsd']);
    if (!stsd) continue;
    // stsd 内容：4 字节 version/flags + 4 字节 entry_count + 采样条目
    const entry = atomChildren(b, stsd.start + 8, stsd.end)[0];
    if (!entry) continue;
    tags.codec = entry.type === 'mp4a' ? 'AAC' : 'UNKNOWN'; // alac/opus 等不在约定集合里
    // AudioSampleEntry 布局（都相对条目内容起点，box 头已去掉）：
    //   0..5 保留 | 6..7 data_reference_index | 8..15 保留(2×u32)
    //   16..17 声道 | 18..19 位深 | 20..21 预定义 | 22..23 保留 | 24..27 采样率(16.16 定点)
    if (entry.start + 28 <= entry.end) {
      tags.rate = u32be(b, entry.start + 24) >>> 16; // 低 16 位是小数部分，要丢掉
      // 位深只对无损编码有意义；AAC 报 16 会误导上层去做解码设置
      if (entry.type === 'alac') {
        tags.bits = u16be(b, entry.start + 18);
        tags.lossless = true;
      }
    }
    break; // 音频轨只有一条，读完就停
  }
  return;
}

/* ================================================================== OGG == */

// Ogg 页：OggS + 版本 + 头类型 + granule(8) + serial(4) + 序号(4) + 校验(4) + 段数(1) + 段表
// 段表每个字节是一个 segment 的长度，255 表示"这个包还没结束"，要跨页继续拼。
function oggPages(b) {
  const pages = [];
  let o = 0;
  let guard = 0;
  while (o + 27 <= b.length && guard++ < 100000) {
    if (!hasAscii(b, o, 'OggS') || b[o + 4] !== 0) break; // 版本必须为 0
    const segs = b[o + 26];
    let payload = 0;
    for (let i = 0; i < segs; i++) payload += b[o + 27 + i];
    const ps = o + 27 + segs;
    if (ps + payload > b.length) break;
    // granule 保留高低 32 位原样：全 1（= -1）是"本页没有结束任何包"的哨兵值，
    // 换成 Number 再比会丢掉精度（2^64-1 在 double 里会被舍入），所以按 32 位分段比。
    pages.push({
      headerType: b[o + 5],
      gLo: u32le(b, o + 6),
      gHi: u32le(b, o + 10),
      start: ps,
      end: ps + payload,
    });
    o = ps + payload;
  }
  return pages;
}

function parseOgg(b, tags) {
  tags.container = 'ogg';
  tags.lossless = false;
  const pages = oggPages(b);
  if (!pages.length) return;
  // 第 1 页是识别头（\x01vorbis），第 2 页起是注释头（\x03vorbis）。
  // 注释可能跨页（段长 255 表示包未完），所以把注释页及其后续页的载荷拼起来再解析：
  // 多出来的音频字节不会被读到（parseVorbisComment 读到注释条数就停）。
  let payload = null;
  for (let i = 0; i < pages.length; i++) {
    const p = b.subarray(pages[i].start, pages[i].end);
    if (!p.length) continue;
    if (p[0] === 1 && p.length >= 28 && hasAscii(p, 1, 'vorbis')) {
      tags.codec = 'Vorbis';
      // 识别头：1 字节包类型 + "vorbis" + version(4) + 声道(1) + 采样率(4,小端) + 三个码率(4 each)
      tags.rate = u32le(p, 12);
      const nominal = u32le(p, 20); // 标称码率，Vorbis 本来就没有恒定码率，这个值最诚实
      if (nominal > 0) tags.kbps = Math.round(nominal / 1000);
      continue;
    }
    if (p[0] === 3 && hasAscii(p, 1, 'vorbis')) {
      let merged = p.subarray(7);
      let total = merged.length;
      for (let k = i + 1; k < pages.length && total < 1048576; k++) {
        const nx = b.subarray(pages[k].start, pages[k].end);
        const joined = new Uint8Array(total + nx.length);
        joined.set(merged, 0);
        joined.set(nx, total);
        merged = joined;
        total = joined.length;
      }
      payload = merged;
      break;
    }
  }
  if (payload) parseVorbisComment(payload, tags); // 与 FLAC 的 Vorbis comment 结构完全一样
  // 时长 = 最后一页的 granule（总采样数）÷ 采样率。跳过 -1 哨兵页。
  if (tags.rate > 0) {
    for (let i = pages.length - 1; i >= 0; i--) {
      const g = pages[i];
      if (g.gHi === 0xffffffff && g.gLo === 0xffffffff) continue;
      const samples = g.gLo + g.gHi * 4294967296;
      if (samples > 0) { tags.duration = round3(samples / tags.rate); break; }
    }
  }
}

/* ================================================================== WAV == */

// RIFF INFO 的块名不统一：音轨号 ffmpeg 写 IPRT（"IPRT" = product/track），
// 其它软件常用 ITRK，两个都认；ICMT（注释）我们不留字段。
const WAV_KEYS = {
  INAM: 'title', IART: 'artist', IPRD: 'album', ICRD: 'year',
  IGNR: 'genre', IPRT: 'track', ITRK: 'track',
};

function parseWavInfo(d, tags) {
  // LIST 块内容：'INFO' + 一串 (4 字节 id + 4 字节小端长度 + 文本)
  if (d.length < 4 || !hasAscii(d, 0, 'INFO')) return;
  let o = 4;
  while (o + 8 <= d.length) {
    const id = fourcc(d, o);
    const len = u32le(d, o + 4);
    const s = o + 8;
    const e = Math.min(d.length, s + len);
    if (len > d.length - s) break;
    // RIFF INFO 规范说文本是空字符结尾的 CP1252，但不少软件写成 UTF-8。
    // 策略：先按 UTF-8 解，出现替换字符（解不通）再退回 latin1。
    let v = decodeUtf8(d, s, e);
    if (v.indexOf('\uFFFD') >= 0) v = decodeLatin1(d, s, e);
    v = clean(v);
    const field = WAV_KEYS[id];
    if (v && field) {
      if (field === 'track') { const [n] = parsePair(v); tags.track = tags.track || n; }
      else if (field === 'year') tags.year = tags.year || yearOf(v);
      else if (field === 'genre') tags.genre = tags.genre || normaliseGenre(v);
      else tags[field] = tags[field] || v;
    }
    o = e + (len & 1); // RIFF 的块长度是奇数时要补 1 字节对齐
  }
}

function parseWav(b, tags) {
  tags.container = 'none'; // WAV 的标签（LIST/INFO 或 'id3 ' 块）不在 container 枚举里，统一报 none
  tags.codec = 'WAV';
  tags.lossless = true;
  let o = 12; // RIFF(4) + size(4) + WAVE(4)
  let byteRate = 0;
  while (o + 8 <= b.length) {
    const id = fourcc(b, o);
    const len = u32le(b, o + 4);
    const s = o + 8;
    if (len > b.length - s) break; // 截断文件：后面的块都不可信
    if (id === 'fmt ' && len >= 16) {
      // fmt：格式(2) 声道(2) 采样率(4) 字节率(4) 块对齐(2) 位深(2)
      // 整个 RIFF 家族都是小端，这里一旦用大端读，采样率会变成 1152122880 这种天文数字。
      const format = u16le(b, s);
      tags.rate = u32le(b, s + 4);
      byteRate = u32le(b, s + 8);
      tags.bits = u16le(b, s + 14);
      if (format !== 1 && format !== 0xfffe) tags.lossless = false; // 非 PCM（如 ADPCM）不算无损
    } else if (id === 'data') {
      // 时长 = 数据字节数 ÷ 每秒字节数，PCM 下是精确值
      if (byteRate > 0) tags.duration = round3(len / byteRate);
    } else if (id === 'LIST') {
      parseWavInfo(b.subarray(s, s + len), tags);
    } else if (id === 'id3 ' || id === 'ID3 ') {
      // 有些软件把整块 ID3v2 塞进 WAV 的 'id3 ' 块，直接复用 ID3v2 解析
      parseId3v2(b.subarray(s, s + len), tags);
    }
    o = s + len + (len & 1); // RIFF 的块长度是奇数时要补 1 字节对齐
  }
  return;
}

/* ============================================================ 扩展名兜底 == */

const EXT_CODEC = { mp3: 'MP3', mp2: 'MP3', flac: 'FLAC', m4a: 'AAC', mp4: 'AAC', aac: 'AAC', ogg: 'Vorbis', oga: 'Vorbis', wav: 'WAV', wave: 'WAV' };

function codecFromName(fileName) {
  const m = /\.([a-z0-9]+)\s*$/i.exec(String(fileName || ''));
  return m ? (EXT_CODEC[m[1].toLowerCase()] || 'UNKNOWN') : 'UNKNOWN';
}

/* ================================================================ 入口 == */

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  // 顺手支持 ArrayBuffer 与别的 TypedArray 视图，省得调用方自己包一层。
  // （ArrayBuffer 本身没有 .buffer 属性，必须单独判一次，否则它会掉进最后一个分支被判成非法输入）
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof ArrayBuffer.isView === 'function' && ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return null;
}

/**
 * 解析音频标签。
 * @param {Uint8Array} bytes    整个文件的字节（也接受 ArrayBuffer / TypedArray 视图）
 * @param {string}     fileName 仅用于字节认不出来时按扩展名兜底猜 codec
 * @returns {{title:string,artist:string,albumArtist:string,album:string,track:number,trackTotal:number,
 *            disc:number,year:string,genre:string,duration:number,codec:string,bits:number,rate:number,
 *            kbps:number,lossless:boolean,picture:({mime:string,data:Uint8Array}|null),container:string}}
 */
export function parseTags(bytes, fileName) {
  const tags = emptyTags();
  try {
    const b = toBytes(bytes);
    if (!b || b.length < 4) {
      tags.codec = codecFromName(fileName); // 空/太短：只能靠文件名
      return tags;
    }

    // 按魔数分派。顺序有讲究：先看固定偏移的魔数，最后才做"扫描式"的 MP3 判断，
    // 否则一段随机数据里的 0xFF 会被误判成 MP3。
    if (hasAscii(b, 0, 'fLaC')) { parseFlac(b, tags); return tags; }
    if (hasAscii(b, 0, 'OggS')) { parseOgg(b, tags); return tags; }
    if (b.length >= 12 && hasAscii(b, 4, 'ftyp')) { parseMp4(b, tags); return tags; }
    if (b.length >= 12 && hasAscii(b, 0, 'RIFF') && hasAscii(b, 8, 'WAVE')) { parseWav(b, tags); return tags; }
    if (hasAscii(b, 0, 'ID3')) { parseMpeg(b, tags); return tags; }
    // 没有 ID3v2 的裸 MP3：只有前 4 字节真的是合法帧头才认，避免把别的格式吞掉
    if (readFrameHeader(b, 0)) { parseMpeg(b, tags); return tags; }

    // 彻底认不出来：按扩展名猜一个 codec 就好，别硬套某个解析器
    tags.codec = codecFromName(fileName);
    tags.container = 'none';
    return tags;
  } catch (e) {
    // 兜底：任何解析器的意外异常都在这里被吃掉。
    // 返回的是"已经填好的部分 + 其余默认值"，仍然是一个结构完整的对象。
    return tags;
  }
}
