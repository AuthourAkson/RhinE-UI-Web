/**
 * Worker 脚本 —— 只为一件事存在：**给内置 demo 音乐补上 Range 支持**。
 *
 * 背景（skill references/pitfalls.md 的 H 节实测）：
 *   Cloudflare Workers 的**静态资源不处理 Range 请求** —— 浏览器请求 `bytes=…` 会拿到整份
 *   200 响应，于是音频"拖不动进度条、一拖回到开头"。网页版这里更明显：主题的 SIGNAL/播放
 *   都依赖准确的时间定位。
 *
 * 做法：把音频目录放进 wrangler.toml 的 `run_worker_first`，由本脚本自己实现 Range。
 *   注意代价（官方文档也写了）：命中 run_worker_first 的请求**一定**会调用 Worker 脚本，
 *   因此**计入**每日请求额度（免费版 10 万/天）。只把 /musiclab/ 放进去，其余所有请求
 *   仍然直接由静态资源层返回 —— 那部分依然是**免费且不限量**的。
 *
 * 两个实现细节（都是踩过的坑）：
 *   1) 向资产服务要整份文件时**必须剥掉 Range 头**，否则可能又拿到 206 或空响应；
 *   2) **不要相信资产服务返回的 content-length** —— 实测它常常不给这个头，
 *      自己按实际切片的长度写。
 */
const AUDIO_PREFIX = '/musiclab/';

/* --------------------------------------------------- 歌词翻译：白名单 CORS 代理 --
 * 主题 lib/translate.js 用 ActiveXObject("MSXML2.XMLHTTP") 取翻译（原版是 foobar2000 的 Windows 脚本环境），
 * 浏览器里既没有 ActiveX 也不能跨域，所以 shim 把请求指到本 Worker 的同源路径 /api/tr?u=<原 URL>。
 *
 * ⚠️ 安全：这**不是**开放代理 —— 只允许下列翻译相关主机，其余一律 403。
 *    （否则任何人都能拿它当免费代理/跳板。）
 */
const TR_ALLOW = [
  'music.163.com',                 // 网易云：听众上传的中文翻译（原版默认来源）
  'api.mymemory.translated.net',   // MyMemory（免费、无需 key）
  'fanyi-api.baidu.com',           // 百度翻译（用户自己的 APP ID + key）
  'api-free.deepl.com',            // DeepL 免费版 key
  'api.deepl.com',
];
async function translationProxy(req, url) {
  const target = url.searchParams.get('u');
  if (!target) return new Response('missing u', { status: 400 });
  let t;
  try { t = new URL(target); } catch (e) { return new Response('bad u', { status: 400 }); }
  if (!/^https?:$/.test(t.protocol) || !TR_ALLOW.includes(t.hostname)) {
    return new Response('host not allowed', { status: 403 });
  }
  const headers = new Headers();
  for (const h of ['content-type', 'authorization', 'accept']) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  // 网易云对没有 Referer 的请求不友好；UA 用真实浏览器的（Workers 默认 UA 可能被拒）
  headers.set('referer', t.origin + '/');
  headers.set('user-agent', req.headers.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36');
  const init = { method: req.method === 'POST' ? 'POST' : 'GET', headers };
  if (init.method === 'POST') init.body = await req.arrayBuffer();
  let r;
  try {
    r = await fetch(t.toString(), init);
  } catch (e) {
    return new Response('upstream failed: ' + (e && e.message), { status: 502, headers: { 'access-control-allow-origin': '*' } });
  }
  const out = new Headers();
  for (const h of ['content-type', 'content-length', 'content-disposition']) {
    const v = r.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set('access-control-allow-origin', '*');
  out.set('cache-control', 'no-store');
  return new Response(r.body, { status: r.status, headers: out });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/tr') return translationProxy(req, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return env.ASSETS.fetch(req);
    if (!url.pathname.startsWith(AUDIO_PREFIX)) return env.ASSETS.fetch(req);

    const range = req.headers.get('range');
    // 1) 剥掉 Range 再问资产服务，拿到完整字节
    const cleanHeaders = new Headers(req.headers);
    cleanHeaders.delete('range');
    const full = await env.ASSETS.fetch(new Request(url.toString(), { method: 'GET', headers: cleanHeaders }));

    const immutable = 'public, max-age=31536000, immutable';
    // ⚠️ Range 分支要自己拼响应头，很容易把 _headers 下发的东西丢掉。
    //    /musiclab/* 在 _headers 里带 `X-Robots-Tag: noindex,noarchive,nosnippet`（版权音频不希望被收录），
    //    浏览器取音频几乎总是带 Range → 这里不显式透传的话那条 noindex 等于没生效。
    const passThrough = (h) => {
      const r = full.headers.get('x-robots-tag');
      if (r) h['x-robots-tag'] = r;
      return h;
    };
    if (!range || full.status !== 200) {
      const h = new Headers(full.headers);
      h.set('accept-ranges', 'bytes');
      if (full.status === 200) h.set('cache-control', immutable);
      return new Response(full.body, { status: full.status, headers: h });
    }

    const buf = await full.arrayBuffer();
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (!m) {
      return new Response(buf, {
        status: 200,
        headers: passThrough({ 'content-type': full.headers.get('content-type') || 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': immutable }),
      });
    }
    const total = buf.byteLength;
    let start, end;
    if (m[1] === '') {                       // bytes=-N：最后 N 字节
      start = Math.max(0, total - Number(m[2]));
      end = total - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
    }
    if (!(start >= 0) || start > end || start >= total) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
    }
    const slice = buf.slice(start, end + 1);
    return new Response(slice, {
      status: 206,
      headers: passThrough({
        'content-type': full.headers.get('content-type') || 'application/octet-stream',
        'content-range': `bytes ${start}-${end}/${total}`,
        'accept-ranges': 'bytes',
        // 2) 自己算长度，别用资产服务的 content-length
        'content-length': String(slice.byteLength),
        'cache-control': immutable,
      }),
    });
  },
};
