#!/usr/bin/env node
// 用最小静态服务器托管 dist/，模拟线上环境（不做任何清单动态生成 —— 这才是关键：
// 静态站没有 Node 进程，清单必须是构建期产物）。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.argv[2] || 8310);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8',
};
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA 兜底（与 _redirects 一致）
    const idx = path.join(ROOT, 'index.html');
    if (fs.existsSync(idx)) { res.writeHead(200, { 'Content-Type': MIME['.html'] }); return fs.createReadStream(idx).pipe(res); }
    res.writeHead(404); return res.end('404');
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const size = fs.statSync(file).size;
  // Range：线上由 worker/src/worker.js 实现（Workers 静态资源本身不处理 Range），
  // 本地验证服务器也实现一份，才能测出真实的"拖动进度条"体验。
  const m = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range).trim());
  if (m) {
    const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (!(start >= 0) || start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, {
      'Content-Type': type, 'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1,
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`dist → http://127.0.0.1:${PORT}/  (${ROOT})`));
