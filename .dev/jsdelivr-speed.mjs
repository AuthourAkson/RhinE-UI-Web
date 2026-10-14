// jsDelivr 国内实测：同一批"大件"分别从 Cloudflare 与 jsDelivr 拉，比速度
// jsDelivr 走 gh 模式指向你的公开仓库；素材本来就在仓库里，所以无需任何新增公开动作。
const REPO = 'AuthourAkson/RhinE-UI-Web';
const REF = process.argv[2] || 'main';
const FILES = [
  ['影片帧 1 张', '/themes/audio-archive/assets/intro/white/frame-001.jpg'],
  ['影片帧 1 张(后段)', '/themes/audio-archive/assets/intro/white/frame-100.jpg'],
  ['地板贴图 1.1MB', '/themes/audio-archive/assets/render/floor/deck-light/plate.jpg'],
  ['主题 JS frame.js', '/themes/audio-archive/js/frame.js'],
  ['壳 app.js', '/app.js'],
  ['清单 307KB', '/__manifest.json'],
];
const measure = async (label, mk) => {
  let ok = 0, bytes = 0, ms = 0, detail = [];
  for (const [name, rel] of FILES) {
    const url = mk(rel);
    const t0 = Date.now();
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const b = await r.arrayBuffer();
      const dt = Date.now() - t0;
      ok++; bytes += b.byteLength; ms += dt;
      detail.push(`${name}:${dt}ms/${(b.byteLength / 1024).toFixed(0)}KB`);
    } catch (e) { detail.push(`${name}:✗${e.name}`); }
  }
  console.log(`\n--- ${label} ---  成功 ${ok}/${FILES.length}  平均 ${ok ? Math.round(ms / ok) : '-'}ms  合计 ${(bytes / 1024).toFixed(0)}KB`);
  for (const d of detail) console.log('    ' + d);
};
await measure('Cloudflare（现状）', (rel) => 'https://rhine.auak.dpdns.org' + rel);
await measure(`jsDelivr @${REF}`, (rel) => `https://cdn.jsdelivr.net/gh/${REPO}@${REF}${rel}`);
// jsDelivr 的响应头（CORS 与缓存策略决定了能不能直接用）
try {
  const r = await fetch(`https://cdn.jsdelivr.net/gh/${REPO}@${REF}/app.js`, { method: 'GET', signal: AbortSignal.timeout(15000) });
  console.log('\njsDelivr 响应头:');
  for (const k of ['access-control-allow-origin', 'cache-control', 'content-type', 'x-served-by', 'timing-allow-origin', 'accept-ranges']) {
    console.log(`   ${k}: ${r.headers.get(k) || '(无)'}`);
  }
} catch (e) { console.log('jsDelivr 头读取失败:', e.name); }
