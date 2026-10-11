#!/usr/bin/env node
/**
 * serve.mjs —— RhinE-UI 的本地静态服务器（零依赖）
 *
 * 为什么需要它（而不是双击 index.html）：
 *   1. 浏览器不允许 file:// 下 fetch / 同步 XHR，主题的 include() 和素材都读不到；
 *   2. 主题会**同步**读文件（utils.ReadTextFile）和**同步**取图片尺寸（img.Width），
 *      浏览器里两个都不成立 —— 所以由服务器预先扫描出清单，前端用清单来满足同步查询：
 *        - 文本文件（js / json / 其他小文本）→ 直接内联进清单，前端 ReadTextFile/include 立即命中
 *        - 图片 → 扫描 PNG/JPEG 文件头拿到宽高，前端 d2d.Image() 立刻就有 Width/Height，像素再异步加载
 *
 * 用法：
 *   node serve.mjs [port]        默认 8300
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8300);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};
const TEXT_EXT = new Set(['.js', '.mjs', '.json', '.txt', '.md', '.css', '.html', '.fcl', '.lrc', '.srt']);

/* ---------------------------------------------------------------- 图片尺寸（文件头解析） -- */
function pngSize(buf) {
  // 8 字节签名 + IHDR：宽高各 4 字节大端，位于偏移 16 / 20
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15（跳过 DHT 0xc4 / JPG 0xc8 / DAC 0xcc）
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}
function imageSize(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(65536);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    const buf = head.subarray(0, n);
    return pngSize(buf) || jpegSize(buf) || null;
  } finally { fs.closeSync(fd); }
}

/* ------------------------------------------------- 主题脚本依赖图（静态解析） -- */
// 为什么不在运行时用 eval 实现 include()：
//   主题每个文件都以 "use strict" 开头，而**严格模式下 eval 的声明不会进全局**，
//   于是 include 进来的 const/function 彼此看不见（实测 ReferenceError: getSetting is not defined）。
//   所以改成：服务器静态解析 include 图 → 前端按依赖顺序插入真正的 <script> 标签
//   （经典脚本共享全局词法作用域），include() 退化为 no-op。
const THEME = 'themes/audio-archive/';

function expandIncludes(src) {
  const hits = [];
  const loops = [...src.matchAll(/for\s*\(\s*const\s+(\w+)\s+of\s*\[([^\]]*)\]\s*\)/g)]
    .map((m) => ({ index: m.index, name: m[1], items: [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]) }));
  // ① include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js")
  for (const m of src.matchAll(/include\(\s*fb\.ProfilePath\s*\+\s*"([^"]+)"\s*\)/g)) hits.push({ i: m.index, p: m[1] });
  // ② for (const f of [...]) include(fb.ProfilePath + `...\${f}...`)
  for (const m of src.matchAll(/include\(\s*fb\.ProfilePath\s*\+\s*`([^`]+)`\s*\)/g)) {
    const tpl = m[1];
    const v = (tpl.match(/\$\{(\w+)\}/) || [])[1];
    if (!v) continue;
    const loop = loops.find((l) => l.name === v && l.index < m.index);
    if (loop) for (const item of loop.items) hits.push({ i: m.index, p: tpl.replace('${' + v + '}', item) });
  }
  // ⚠️ 必须按源码出现顺序展开：分两趟收集会把 lib 的 for 循环排到后面，
  //    导致 archive.js 先于它依赖的 library.js 加载（实测 LIB_LISTENERS is not defined）
  hits.sort((a, b) => a.i - b.i);
  return hits
    .map((h) => h.p.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+/, ''))
    .map((p) => (p.startsWith(THEME) ? p : THEME + p.replace(/^themes\/audio-archive\//, '')));
}

function buildScriptOrders(text) {
  const orders = {};
  const entries = ['frame', 'header', 'transport', 'stage', 'manager', 'head', 'card', 'tip', 'fx', 'placeholder'];
  // 网页版自己加的面板入口（不放进主题目录，保持 themes/audio-archive 与原版逐字节一致）：
  //   playlist —— 原版这里是 Columns UI 的原生 Playlist View，网页版用 DOM 复刻
  const EXTRA = { playlist: 'native/playlist.js' };
  for (const [name, entry] of [...entries.map((n) => [n, `${THEME}js/${n}.js`]), ...Object.entries(EXTRA)]) {
    if (!text[entry]) continue;
    const seen = new Set();
    const order = [];
    const visit = (rel, depth) => {
      if (seen.has(rel) || depth > 8 || !text[rel]) return;
      seen.add(rel);
      for (const dep of expandIncludes(text[rel])) visit(dep, depth + 1);   // 依赖先行
      order.push(rel);
    };
    visit(entry, 0);
    orders[name] = order;
  }
  return orders;
}

/* ---------------------------------------------------------------------------- 清单 -- */
function buildManifest() {
  const text = {}, images = {}, files = [];
  // 这些目录不属于"主题资源"，扫进来只会让清单变大变慢：.git（本仓库自己的对象库）、
  // node_modules、以及开发用 Chrome 配置（含缓存，几万个文件）
  const SKIP = new Set(['.git', 'node_modules', 'chrome-profile', '.dev/chrome-profile']);
  let bytes = 0;
  const walk = (dir, relDir = '') => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relDir ? relDir + '/' + ent.name : ent.name;
      if (ent.isDirectory()) { if (!SKIP.has(rel) && !SKIP.has(ent.name)) walk(path.join(dir, ent.name), rel); continue; }
      const full = path.join(dir, ent.name);
      const ext = path.extname(ent.name).toLowerCase();
      const size = fs.statSync(full).size;
      bytes += size;
      files.push(rel);
      if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        const dim = imageSize(full);
        if (dim) images[rel] = dim;
      } else if (TEXT_EXT.has(ext) && size < 4 * 1024 * 1024) {
        // .fcl 是二进制，但主题会当文本读（latin1 解出可读字节），保持原样塞进去
        text[rel] = ext === '.fcl' ? fs.readFileSync(full, 'latin1') : fs.readFileSync(full, 'utf8');
      }
    }
  };
  walk(ROOT);
  // root 给面板用：主题按 fb2k 的完整路径（D:\…\musiclab\a.lrc）找 sidecar 文件，
  // 而清单的键是相对仓库根的（musiclab/a.lrc），面板靠 root 把前缀剥掉才能命中。
  return { text, images, files, bytes, root: ROOT.replace(/\\/g, '/') + '/', scripts: buildScriptOrders(text), built: new Date().toISOString() };
}

let cache = null;
const manifest = () => (cache ??= buildManifest());

/* ------------------------------------------------ 演示/自测用的"音乐库"（HTTP 提供器） -- */
// 真实用法是 File System Access 选目录；但无头浏览器点不了原生目录对话框，
// 所以另给一条 HTTP 通道，按 URL 取文件。
// 目录优先级：仓库根下的 musiclab/（放测试音乐的地方，默认）、.dev/music（旧演示曲库）。
//
// ⚠️ path 必须是**真实绝对路径**（D:\…\musiclab\x.mp3），不能伪造：
//    主题的歌词/封面是"按音频文件路径推同名文件"来找的（lib/lyrics.js:57 用
//    path 换后缀取 .lrc），伪造路径（如 C:\Music\…）永远推不出仓库里真实存在的 .lrc。
//    用反斜杠形式还有个历史原因：主题的 albumKeyOf()/albumDir() 按 "\\" 切分路径。
const MUSIC_DIRS = [path.join(ROOT, 'musiclab'), path.join(ROOT, '.dev', 'music')];
const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.mp4', '.ogg', '.oga', '.opus', '.wav', '.aac']);
function musicLibrary() {
  const out = [];
  const dir = MUSIC_DIRS.find((d) => fs.existsSync(d));
  if (!dir) return out;
  const rel0 = path.relative(ROOT, dir).replace(/\\/g, '/');       // 'musiclab' 或 '.dev/music'
  const walk = (cur, rel) => {
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, ent.name);
      const r = rel ? rel + '\\' + ent.name : ent.name;
      if (ent.isDirectory()) { walk(full, r); continue; }
      if (!AUDIO_EXT.has(path.extname(ent.name).toLowerCase())) continue;
      out.push({
        path: full,                                                   // 真实路径：歌词/封面靠它推同名文件
        url: '/' + rel0 + '/' + (rel ? rel.replace(/\\/g, '/') + '/' : '') + encodeURIComponent(ent.name),
        size: fs.statSync(full).size,
      });
    }
  };
  walk(dir, '');
  return out;
}
const MUSIC_LABEL = () => {
  const d = MUSIC_DIRS.find((x) => fs.existsSync(x));
  return d ? path.relative(ROOT, d).replace(/\\/g, '/') : '(无)';
};

/* ---------------------------------------------------------------------------- HTTP -- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/__manifest.json') {
    const m = manifest();
    const body = JSON.stringify(m);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    console.log(`  manifest: ${Object.keys(m.text).length} 个文本 / ${Object.keys(m.images).length} 张图尺寸 / ${m.files.length} 个文件 / ${(m.bytes / 1048576).toFixed(1)} MB`);
    for (const [k, v] of Object.entries(m.scripts || {})) console.log(`    ${k}: ${v.length} 个脚本（顺序已解析）`);
    return res.end(body);
  }
  if (pathname === '/__rebuild') { cache = null; res.writeHead(200); return res.end('ok'); }

  if (pathname === '/__music.json') {
    const lib = musicLibrary();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    console.log(`  music library: ${lib.length} 个音频文件（${MUSIC_LABEL()}）`);
    return res.end(JSON.stringify(lib));
  }

  if (pathname === '/') pathname = '/index.html';
  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 ' + pathname);
  }
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  // 主题会带 Range 请求拖音频；本地服务也支持一下，行为和线上一致
  const range = req.headers.range;
  const type = MIME[ext] || 'application/octet-stream';
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] === '' ? stat.size - Number(m[2]) : Number(m[1]);
      let end = m[2] === '' ? stat.size - 1 : Math.min(Number(m[2]), stat.size - 1);
      if (!(start >= 0) || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
      res.writeHead(206, {
        'Content-Type': type, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1,
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  const m = manifest();
  console.log(`RhinE-UI  →  http://127.0.0.1:${PORT}/`);
  console.log(`  根目录 ${ROOT}`);
  console.log(`  清单已建：${Object.keys(m.text).length} 个文本文件、${Object.keys(m.images).length} 张图片尺寸、共 ${m.files.length} 个文件 / ${(m.bytes / 1048576).toFixed(1)} MB`);
});
