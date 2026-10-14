// 站在爬虫/盗链者的角度实测一遍公开可达性（不需要任何凭据）
const SITE = 'https://rhine.auak.dpdns.org';
const PORTAL = 'https://auak.dpdns.org';
const out = [];
const show = (s) => { out.push(s); console.log(s); };

const head = async (url, opts = {}) => {
  try {
    const r = await fetch(url, { redirect: 'manual', ...opts });
    const b = await r.arrayBuffer().catch(() => new ArrayBuffer(0));
    return { status: r.status, len: b.byteLength, headers: Object.fromEntries(r.headers) };
  } catch (e) { return { status: 'ERR ' + e.message, len: 0, headers: {} }; }
};

show('=== 1) robots.txt / sitemap（爬虫规则是否声明）===');
for (const u of [`${SITE}/robots.txt`, `${PORTAL}/robots.txt`, `${SITE}/sitemap.xml`]) {
  const r = await head(u);
  const body = r.len ? '' : '';
  show(`  ${u}  →  ${r.status}  ${r.len ? r.len + ' 字节' : ''}`);
  if (r.status === 200 && r.len < 400) {
    const t = await (await fetch(u)).text();
    show('     ' + t.trim().split('\n').slice(0, 6).join('\n     '));
  }
}

show('\n=== 2) 资产清单是否公开（拿到它就等于拿到全部路径，含音频）===');
const man = await head(`${SITE}/__manifest.json`);
show(`  /__manifest.json → ${man.status}  ${(man.len / 1024).toFixed(0)} KB  cache-control=${man.headers['cache-control'] || '-'}`);

show('\n=== 3) 音频是否可被任意网站盗链（关键）===');
const mp3 = `${SITE}/musiclab/Mili%20-%20world.execute%20(me)%20%3B.mp3`;
for (const [label, opts] of [
  ['无 Referer（程序直接抓）', {}],
  ['伪造第三方站点 Referer', { headers: { Referer: 'https://evil-scraper.example/grab' } }],
  ['带 Range（只取前 1KB）', { headers: { Range: 'bytes=0-1023' } }],
]) {
  const r = await head(mp3, opts);
  show(`  ${label.padEnd(24)} → HTTP ${r.status}  ${r.status === 206 || r.status === 200 ? (r.len / 1024).toFixed(1) + ' KB' : ''}  cf-cache=${r.headers['cf-cache-status'] || '-'}  ${r.headers['content-type'] || ''}`);
}

show('\n=== 4) 音频若被反复抓，会不会消耗 Workers 配额（/musiclab/* 走脚本）===');
const r1 = await head(mp3, { headers: { Range: 'bytes=0-99' } });
show(`  Range 请求 → HTTP ${r1.status}（206 = 走了 Worker 的 Range 实现，计入 /musiclab/* 调用量）`);

show('\n=== 5) 站点响应头里的防护线索 ===');
for (const u of [SITE, `${SITE}/`, `${PORTAL}/`]) {
  const r = await head(u);
  show(`  ${u} → ${r.status}`);
  for (const k of ['server', 'cf-cache-status', 'cache-control', 'cf-ray', 'x-frame-options', 'content-security-policy']) {
    if (r.headers[k]) show(`     ${k}: ${String(r.headers[k]).slice(0, 80)}`);
  }
}
