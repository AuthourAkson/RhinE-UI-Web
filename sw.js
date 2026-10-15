/* Service Worker —— 让第二次打开不再耗流量（国内到 Cloudflare 的链路只有 ~30KB/s，必须本地化）
 *
 * 策略总览：
 *   install  预缓存"壳"（index/panel/app.js/shim/主题 JS+字体）——约 1MB，几秒内就能进界面
 *   activate 清掉旧版本缓存 + clients.claim()（首次安装后立刻接管，不用等下次）
 *   之后：
 *     · 导航（打开页面）           → 网络优先 + 6 秒超时 → 回退缓存（断网也能开）
 *     · 同源静态（主题/shim/字体…）→ stale-while-revalidate（秒开，同时后台悄悄更新）
 *     · /musiclab/* 音频           → 缓存优先 + **自己实现 Range 切片**（<audio> 发的是 206 请求）
 *     · __manifest.json / __music.json → stale-while-revalidate
 *     · 其它同源 GET               → stale-while-revalidate（开场影片 145 帧就走这条，第一次播完就永久本地）
 *   页面还能 postMessage {type:'PRECACHE'}，让 SW 在**后台**把影片帧等大件预先抓好。
 *
 * 注意：SW 文件本身必须 no-cache（见 build-static.mjs 的 _headers），否则更新发不出去。
 */
const VERSION = 'rhine-v1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const MEDIA = `${VERSION}-media`;

// 预缓存清单由构建脚本生成（dist/sw-assets.json），见 build-static.mjs
let SHELL_LIST = [
  '/', '/index.html', '/panel.html', '/app.js', '/shim/shim.js', '/native/playlist.js',
  '/robots.txt', '/__manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try {
      const r = await fetch('/sw-assets.json', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j.shell) && j.shell.length) SHELL_LIST = j.shell;
        self.__bgList = Array.isArray(j.background) ? j.background : [];
      }
    } catch (err) { /* 拿不到就用内置的兜底清单 */ }
    const c = await caches.open(SHELL);
    // 逐个抓：单个失败不能拖垮整个安装（链路差时很常见）。
    // ⚠️ 也要**重试** —— 这里是最该重试的地方：安装没抓到的文件，就是"下次打开仍然要联网"的文件。
    await Promise.all(SHELL_LIST.map(async (u) => {
      try {
        const r = await fetchRetry(new Request(u, { cache: 'reload' }), 3);
        if (r && r.status === 200) await c.put(u, r.clone());
      } catch (err) { /* 这次没抓到就算了，运行时还会再补 */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* ---------------------------------------------------------------- Range 支持 --
 * <audio> 取音频时发 Range 请求，而 Cache API 只能存完整的 200。
 * 所以：缓存里始终存"整份"，命中 Range 请求时自己切片，返回 206 + Content-Range。
 * 首次播放会先整份下载（去掉 Range 再请求），之后永久本地。
 */
const MEDIA_HEADERS = (res) => {
  const h = new Headers();
  for (const k of ['content-type', 'cache-control', 'accept-ranges', 'x-robots-tag']) {
    const v = res.headers.get(k);
    if (v) h.set(k, v);
  }
  h.set('accept-ranges', 'bytes');
  return h;
};
async function mediaResponse(req) {
  const cache = await caches.open(MEDIA);
  const url = new URL(req.url);
  let full = await cache.match(url.pathname);
  if (!full) {
    const clean = new Request(url.toString(), { method: 'GET', headers: new Headers() });   // 去掉 Range
    const net = await fetch(clean);
    if (!net || net.status !== 200) return net || Response.error();
    await cache.put(url.pathname, net.clone());
    full = net;
  }
  const range = req.headers.get('range');
  if (!range) return new Response(full.clone().body, { status: 200, headers: MEDIA_HEADERS(full) });

  const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
  const buf = await full.clone().arrayBuffer();
  const total = buf.byteLength;
  if (!m) return new Response(buf, { status: 200, headers: MEDIA_HEADERS(full) });
  let start, end;
  if (m[1] === '') { start = Math.max(0, total - Number(m[2])); end = total - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1); }
  if (!(start >= 0) || start > end || start >= total) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
  }
  const h = MEDIA_HEADERS(full);
  h.set('content-range', `bytes ${start}-${end}/${total}`);
  h.set('content-length', String(end - start + 1));
  return new Response(buf.slice(start, end + 1), { status: 206, headers: h });
}

/* ------------------------------------------------------------------ 通用策略 */
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// ⚠️⚠️ 关键修复：这台机器所在网络是"**逐连接掷骰子**" —— anycast 会把每条新连接送到不同机房
//    （实测同一域名几分钟内落到 PDX/LAX/MAD/BOS；两个主机名同一刻能在不同大洲）。
//    所以失败的单位是"连接"，不是"请求"：一条连接踩雷，它上面复用的整批资源全挂
//    —— 用户看到的就是 "/panel.html 可能暂时无法连接"。**重试等于重新掷一次骰子**，
//    命中好机房的概率很高，这比"减少请求数"更直接。所有网络取数统一走这里。
async function fetchRetry(req, tries = 3, timeoutMs = 0) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const p = fetch(req);
      const r = timeoutMs ? await withTimeout(p, timeoutMs) : await p;
      if (r && r.status < 500) return r;                  // 4xx 是确定答案，不重试
      lastErr = new Error('status ' + (r && r.status));
    } catch (e) { lastErr = e; }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, i === 0 ? 300 : 800));
  }
  throw lastErr || new Error('fetch failed');
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: false });
  if (hit) return hit;
  const net = await fetchRetry(req);
  if (net && net.status === 200 && req.method === 'GET') cache.put(req, net.clone()).catch(() => { });
  return net;
}
async function swr(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const updating = fetchRetry(req).then((net) => {
    if (net && net.status === 200) cache.put(req, net.clone()).catch(() => { });
    return net;
  }).catch(() => null);
  if (hit) return hit;                                    // 有缓存立刻返回，后台更新
  const net = await updating;
  return net || Response.error();
}
async function networkFirst(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const net = await fetchRetry(req, 3, timeoutMs);
    if (net && net.status === 200) cache.put(req, net.clone()).catch(() => { });
    return net;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await caches.open(SHELL);
      const idx = (await shell.match('/index.html')) || (await shell.match('/'));
      if (idx) return idx;
    }
    return Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;         // 跨域一律不管

  // 音频：缓存优先 + Range 切片
  if (url.pathname.startsWith('/musiclab/')) { e.respondWith(mediaResponse(req)); return; }

  // ⚠️ /cdn-cgi/* 必须永不缓存、直接走网络：
  //    · /cdn-cgi/trace 是"我现在落到哪个机房"的诊断入口，缓存了就一直显示旧机房；
  //    · /cdn-cgi/challenge-platform/* 是 Cloudflare 的人机验证脚本，缓存会导致验证失败；
  //    · /cdn-cgi/rum 是云分析的 beacon（POST，本来也就不该被缓存）。
  if (url.pathname.startsWith('/cdn-cgi/')) return;

  // 页面导航：网络优先，断网/超时回退缓存
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, SHELL, 6000)); return; }

  // 会随构建变化的清单：网络优先但可回退
  if (url.pathname === '/__manifest.json' || url.pathname === '/__music.json' || /^\/__manifest\.[0-9a-f]+\.json$/.test(url.pathname)) {
    e.respondWith(networkFirst(req, SHELL, 6000)); return;
  }

  // 壳与主题代码：stale-while-revalidate（秒开 + 后台更新）
  const p = url.pathname;
  if (p === '/app.js' || p.startsWith('/shim/') || p.startsWith('/native/') || p.startsWith('/themes/') || p.startsWith('/workers/') || p === '/panel.html' || p === '/robots.txt') {
    e.respondWith(swr(req, /\.(jpg|jpeg|png|webp|gif|mp4|woff2?|ttf|otf)$/i.test(p) ? SHELL : SHELL)); return;
  }

  // 其余同源 GET（图片/影片帧等）：缓存优先，没有再走网络并缓存
  e.respondWith(cacheFirst(req, SHELL).catch(() => fetch(req)));
});

/* --------------------------------------------------------------- 后台预取 --
 * 页面发 {type:'PRECACHE'}：SW 在后台把影片帧等大件抓好（不阻塞界面）。
 * 一次只抓一个，避免本来就窄的带宽被占满。
 */
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'PRECACHE') {
    e.waitUntil((async () => {
      const list = (d.list && d.list.length ? d.list : (self.__bgList || []));
      if (!list.length) return;
      const cache = await caches.open(SHELL);
      const notify = (msg, extra) => self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ type: msg, ...(extra || {}) })));
      let done = 0, bytes = 0;
      for (const u of list) {
        if (await cache.match(u)) { done++; continue; }
        try {
          const r = await fetch(u, { cache: 'reload' });
          if (r && r.status === 200) { bytes += Number(r.headers.get('content-length') || 0); await cache.put(u, r.clone()); }
        } catch (err) { /* 链路差就跳过，下次再补 */ }
        done++;
        if (done % 10 === 0) notify('PRECACHE_PROGRESS', { done, total: list.length, bytes });
      }
      notify('PRECACHE_DONE', { done, total: list.length, bytes });
    })());
  } else if (d.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
