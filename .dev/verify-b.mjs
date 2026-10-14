// B 的线上行为验证：四种 Referer 情况 + 应用资源不受影响 + 音频仍可播放
const SITE = 'https://rhine.auak.dpdns.org';
const MP3 = `${SITE}/musiclab/Mili%20-%20world.execute%20(me)%20%3B.mp3`;
const HEAD = { Range: 'bytes=0-1023' };   // 浏览器取音频的方式

const t = async (label, url, headers = {}, expect) => {
  const r = await fetch(url, { headers, redirect: 'manual', cache: 'no-store' });
  await r.arrayBuffer().catch(() => {});
  const got = r.status;
  const ok = expect.includes(got);
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(42)} HTTP ${got}  ${expect.includes(got) ? '' : `(期望 ${expect.join('/')})`}`);
  return got;
};

console.log('=== ① 防盗链：四种 Referer 情况 ===');
await t('其他网站引用（应被 Block）', MP3, { ...HEAD, Referer: 'https://evil-scraper.example/grab' }, [403]);
await t('搜索引擎引用（应被 Block）', MP3, { ...HEAD, Referer: 'https://www.google.com/' }, [403]);
await t('无 Referer 直接访问（应放行）', MP3, HEAD, [200, 206]);
await t('本站应用同源引用（应放行）', MP3, { ...HEAD, Referer: SITE + '/' }, [200, 206]);
await t('门户页引用（应放行）', MP3, { ...HEAD, Referer: 'https://auak.dpdns.org/' }, [200, 206]);

console.log('\n=== ② 应用与门户完全不受影响 ===');
for (const [label, url] of [
  ['应用首页 /', SITE + '/'],
  ['面板 /panel', SITE + '/panel'],
  ['面板页 /panel.html', SITE + '/panel.html'],
  ['shim/shim.js', SITE + '/shim/shim.js'],
  ['app.js', SITE + '/app.js'],
  ['主题 JS', SITE + '/themes/audio-archive/js/frame.js'],
  ['清单 __manifest.json', SITE + '/__manifest.json'],
  ['门户首页', 'https://auak.dpdns.org/'],
  ['门户 API /api/list', 'https://auak.dpdns.org/api/list'],
]) await t(label, url, {}, [200, 206, 301, 302, 307, 308, 404]);

console.log('\n=== ③ 规则是否按预期生效（读回）===');
console.log('  （见随后 dump 输出）');
