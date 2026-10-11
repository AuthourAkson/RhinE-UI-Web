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
  '.dev', 'image', 'musiclab', 'node_modules',
  'serve.mjs', 'build-static.mjs', 'README.md', '.gitignore',
  ...KEEP.map((k) => k),
];

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
const m = buildManifest({ exclude: EXCLUDE, root: '' });
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
`;

// SPA 兜底：真实文件优先，其余交给 index.html（面板入口 panel.html 存在，不受影响）
const REDIRECTS = `/*    /index.html   200
`;

fs.writeFileSync(path.join(OUT, '_headers'), HEADERS);
fs.writeFileSync(path.join(OUT, '_redirects'), REDIRECTS);

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
