#!/usr/bin/env node
/**
 * build-static.mjs —— 生成可直接部署到 Cloudflare Pages / 任意静态主机的 dist/
 *
 * 为什么需要构建：主题会**同步**读文本、**同步**问图片尺寸，浏览器里都做不到，
 * 所以本地是靠 serve.mjs 现算一份清单（把文本内联、把图片宽高预先量好）。
 * 静态站没有 Node 进程，只能把这步**放在构建期**：dist/__manifest.json 就是那份清单。
 *
 * 清单逻辑直接 import 自 serve.mjs，改一处两边同步，不会漂移。
 *
 * 用法：  node build-static.mjs [--out dist] [--keep <额外要保留的目录>]
 * 部署：  npx wrangler pages deploy dist --project-name=<你的 Pages 项目名>
 *         （或把仓库接到 Pages 的 Git 集成，构建命令 node build-static.mjs、输出目录 dist）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildManifest, PROJECT_ROOT } from './serve.mjs';

const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = path.resolve(PROJECT_ROOT, argOf('--out', 'dist'));
const KEEP = argv.reduce((acc, a, i) => (a === '--keep' && argv[i + 1] ? acc.concat(argv[i + 1].split(',')) : acc), []);

/* ---------------------------------------------------------------- 排除清单 --
 * .dev  开发探针 + 我调试留下的 .dev/manifest.json（实测 3.1 MB，曾被内联进清单）
 * image 开发截图
 * musiclab / .dev/music  版权音频（且 11 MB）
 * 根目录的本地脚本（启动器、本地服务器）
 */
const EXCLUDE = [
  '.dev', 'image', 'node_modules',
  'serve.mjs', 'build-static.mjs', 'README.md', '.gitignore',
  '启动 RhinE-UI.cmd', '停止 RhinE-UI.cmd',          // 本机启动器，线上没意义
  ...KEEP.map((k) => k),
];

/* ------------------------------------------------------------ 内置 demo 曲库 --
 * 把 musiclab/ 一起发上去当"默认音乐"，让访客不用先选目录就能快速体验。
 * 额度上不用担心：静态资源请求免费且不限量（见 wrangler.toml 顶部说明）。
 * 唯一要额外做的是 Range —— Workers 静态资源不处理 Range，音频拖不动进度条，
 * 所以 worker/src/worker.js 给 /musiclab/* 自己实现了 Range。
 * --no-demo 可以关掉（此时 musiclab/ 像以前一样被排除）。
 */
const DEMO = !argv.includes('--no-demo');
if (!DEMO) EXCLUDE.push('musiclab');

/* ------------------------------------------------------- 开场影片：只发一套 --
 * assets/intro/<皮肤>/ 是预渲染影片（每套 145 张 JPEG，12.6~17.2 MB），10 套共 144.6 MB ——
 * dist 里 216 MB 的绝大部分就在这儿。
 * 主题 fx.js:73 自己就容错：某个皮肤没有自己的影片时回落到默认皮肤那套：
 *     function filmDir() { const d = INTRO_ROOT + STATE.skin + "\\";
 *         return utils.IsFile(d + "intro.json") ? d : INTRO_ROOT + SKIN_DEFAULT + "\\"; }
 * 所以只发默认皮肤那套即可，其余 9 套是纯浪费。默认皮肤从主题源码读出来，不写死。
 */
const skinsSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'themes/audio-archive/js/lib/skins.js'), 'utf8');
const SKIN_DEFAULT = (/SKIN_DEFAULT\s*=\s*["']([^"']+)["']/.exec(skinsSrc) || [])[1] || 'white';
const introSkin = argOf('--intro-skin', SKIN_DEFAULT);
if (introSkin === 'all') { /* 全发：一个都不排除 */ }
const introRoot = path.join(PROJECT_ROOT, 'themes/audio-archive/assets/intro');
const allIntros = fs.existsSync(introRoot)
  ? fs.readdirSync(introRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
const droppedIntros = introSkin === 'all' ? [] : allIntros.filter((s) => s !== introSkin);
for (const s of droppedIntros) EXCLUDE.push(`themes/audio-archive/assets/intro/${s}`);
let introSaved = 0;
for (const s of droppedIntros) {
  const d = path.join(introRoot, s);
  introSaved += fs.readdirSync(d).reduce((n, f) => n + fs.statSync(path.join(d, f)).size, 0);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

console.log('扫描并生成清单…');
// ⚠️ root 用 "D:/" 而不是空串：内置 demo 曲库给主题的路径是 `D:\musiclab\…`
//    （必须用反斜杠 —— 主题的 albumDir()/albumKeyOf() 按 `\` 切分路径分组），
//    而清单的键是仓库相对路径 `musiclab/…`。shim 的 norm() 会剥掉 MANIFEST.root 前缀，
//    所以这里把 root 设成 "D:/"，`D:\musiclab\x.lrc` 就正好归一化成 `musiclab/x.lrc` 命中清单。
//    主题自己的路径（themes/…）不以 D:/ 开头，不受影响。
const m = buildManifest({ exclude: EXCLUDE, root: 'D:/' });
const manifestJson = JSON.stringify(m);

let copied = 0, copiedBytes = 0;
for (const rel of m.files) {
  const from = path.join(PROJECT_ROOT, rel);
  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
  copiedBytes += fs.statSync(from).size;
}
fs.writeFileSync(path.join(OUT, '__manifest.json'), manifestJson);

/* ------------------------------------------------- 内置 demo 曲库索引 __music.json --
 * 本地开发时这份是 serve.mjs 现算的；静态站没有 Node，所以构建期写死。
 * 形状与本地完全一致（{ path, url, size }），宿主 app.js 的 loadHttpLibrary() 原样能用。
 * path 用 `D:\musiclab\<名字>`：配合上面的 root="D:/" 归一化成清单键，于是
 * 同目录同名的 .lrc 歌词（清单里已内联）能被主题的 utils.IsFile/ReadTextFile 命中。
 */
const AUDIO_EXT_BUILD = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.oga', '.opus', '.wav', '.aac']);
let demoFiles = 0, demoBytes = 0;
if (DEMO) {
  const musicDir = path.join(PROJECT_ROOT, 'musiclab');
  if (fs.existsSync(musicDir)) {
    const list = [];
    const walkMusic = (dir, rel) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const r = rel ? rel + '\\' + ent.name : ent.name;
        if (ent.isDirectory()) { walkMusic(full, r); continue; }
        if (!AUDIO_EXT_BUILD.has(path.extname(ent.name).toLowerCase())) continue;
        const size = fs.statSync(full).size;
        list.push({
          path: 'D:\\musiclab\\' + r,                                   // 主题按 `\` 切分路径分组
          url: '/musiclab/' + r.split('\\').map(encodeURIComponent).join('/'),
          size,
        });
        demoFiles++; demoBytes += size;
      }
    };
    walkMusic(musicDir, '');
    list.sort((a, b) => a.path.localeCompare(b.path));
    fs.writeFileSync(path.join(OUT, '__music.json'), JSON.stringify(list));
  }
}

/* ------------------------------------------------------------------ 缓存策略 --
 * 主题目录与原版 1.4.0 **逐字节一致**，可以放心 immutable 一年 —— 体积的 95% 都在这里
 * （assets/render 70 MB 的 PNG、字体 0.72 MB）。
 * 应用代码（app.js / shim / workers / html）会随开发更新，走 no-cache 让浏览器每次校验，
 * 命中的是 304（约 200 字节），比重新下载省得多。
 * 清单同理：内容一变就换，靠 ETag 走 304。
 */
const HEADERS = `# Cloudflare Pages / Netlify 通用缓存策略
/themes/*
  Cache-Control: public, max-age=31536000, immutable

/__manifest.json
  Cache-Control: public, max-age=0, must-revalidate

/*.html
  Cache-Control: public, max-age=0, must-revalidate

/app.js
  Cache-Control: public, max-age=0, must-revalidate

/shim/*
  Cache-Control: public, max-age=0, must-revalidate

/native/*
  Cache-Control: public, max-age=0, must-revalidate

/workers/*
  Cache-Control: public, max-age=0, must-revalidate

# 字体虽然也 immutable，单独列出便于将来做子集化后只改这一条
/themes/audio-archive/assets/fonts/*
  Cache-Control: public, max-age=31536000, immutable

# 内置音频库：明确告诉爬虫不要收录/存档。
# 依据：7 天分析里 /musiclab/* 被一个日本 IP（103.62.49.138）把整套曲目抓了一遍，
# 而这些含第三方版权音频，不该被搜索引擎收录。noindex 对**合规**爬虫有效
# （恶意扫描器无视 robots，那部分靠 Cloudflare 的 WAF/限流挡）。
/musiclab/*
  X-Robots-Tag: noindex, noarchive, nosnippet
  Cache-Control: public, max-age=3600

/robots.txt
  Cache-Control: public, max-age=3600

/sitemap.xml
  Cache-Control: public, max-age=3600
`;

// SPA 兜底：本站不需要（见上面说明）。保留变量方便将来别的站复用这套构建。
const REDIRECTS = `/*    /index.html   200
`;
void REDIRECTS;

// ⚠️ 故意**不写 `_redirects` 的 SPA 兜底**：本站没有客户端路由（视图切换全在 iframe 里），
//    把未知路径都回 index.html 只会掩盖问题 —— 比如某个主题 JS 缺失时会返回 HTML，
//    解析报错莫名其妙。配合 wrangler.toml 的 not_found_handling = "404-page"，
//    缺文件就是干净的 404，扫描器打 /\.env 也完全不消耗额度。
fs.writeFileSync(path.join(OUT, '_headers'), HEADERS);
// wrangler 的 .assetsignore（放在 assets 目录根部）：dist 已经是干净产物，这里只是防呆 ——
// 万一将来有人在 dist 里放了本地验证产物（浏览器配置动辄几十 MB），不会被一起上传。
fs.writeFileSync(path.join(OUT, '.assetsignore'), [
  '# 本地验证产物 / 后端源码，永远不要上传',
  '_verify/',
  'worker/',
  '.secrets/',
  'node_modules/',
  '*.log',
  '*.map',
  '',
].join('\n'));

const mfSize = Buffer.byteLength(manifestJson);
const hash = crypto.createHash('sha256').update(manifestJson).digest('hex').slice(0, 12);
fs.writeFileSync(path.join(OUT, '__manifest.' + hash + '.json'), manifestJson);

const textBytes = Object.values(m.text).reduce((n, v) => n + Buffer.byteLength(v), 0);
const big = Object.entries(m.text).map(([k, v]) => [k, Buffer.byteLength(v)]).sort((a, b) => b[1] - a[1]).slice(0, 6);
const distBytes = (() => {
  let n = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else n += fs.statSync(f).size; } };
  walk(OUT); return n;
})();

console.log(`
──────── 构建完成 ────────
输出目录        ${OUT}
拷贝文件        ${copied} 个 / ${(copiedBytes / 1048576).toFixed(2)} MB
清单            内联文本 ${Object.keys(m.text).length} 个 / ${(textBytes / 1048576).toFixed(2)} MB（未压缩）
                图片宽高 ${Object.keys(m.images).length} 张
                __manifest.json ${(mfSize / 1048576).toFixed(2)} MB → __manifest.${hash}.json
dist 总计       ${(distBytes / 1048576).toFixed(2)} MB（未压缩；Cloudflare 会自动 Brotli）
排除            ${EXCLUDE.join('  ')}
开场影片        只发默认皮肤 "${introSkin}"（其余 ${droppedIntros.length} 套省下 ${(introSaved / 1048576).toFixed(1)} MB）
                想全发：node build-static.mjs --intro-skin=all（不推荐，+${(introSaved / 1048576).toFixed(0)} MB）

清单里最大的文本（未压缩）：
${big.map(([k, v]) => '  ' + (v / 1024).toFixed(0).padStart(6) + ' KB  ' + k).join('\n')}

下一步：
  npx wrangler pages deploy "${path.relative(process.cwd(), OUT) || '.'}" --project-name=<Pages 项目名>
  或把仓库接到 Pages 的 Git 集成：构建命令 node build-static.mjs，输出目录 dist
`);
