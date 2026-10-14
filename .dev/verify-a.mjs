// A 部分线上验收：robots.txt / X-Robots-Tag（含 Range 请求）/ 应用不受影响
const SITE = 'https://rhine.auak.dpdns.org';
const mp3 = `${SITE}/musiclab/Mili%20-%20world.execute%20(me)%20%3B.mp3`;
const show = (s) => console.log(s);

show('=== robots.txt ===');
const rb = await fetch(`${SITE}/robots.txt`, { cache: 'no-store' });
show(`  HTTP ${rb.status}  ${rb.headers.get('content-type')}  cache=${rb.headers.get('cache-control')}`);
const txt = await rb.text();
show('  ' + txt.trim().split('\n').slice(0, 4).join('\n  '));

show('\n=== X-Robots-Tag：普通 GET vs Range（Range 才是浏览器取音频的方式）===');
for (const [label, opts] of [['普通 GET', {}], ['Range bytes=0-1023', { headers: { Range: 'bytes=0-1023' } }]]) {
  const r = await fetch(mp3, { ...opts, cache: 'no-store' });
  show(`  ${label.padEnd(20)} HTTP ${r.status}  x-robots-tag=${r.headers.get('x-robots-tag') || '(无 ✗)'}  accept-ranges=${r.headers.get('accept-ranges')}  cache=${r.headers.get('cache-control')}`);
}

show('\n=== 应用不受影响：面板与脚本仍正常 ===');
for (const p of ['/panel', '/shim/shim.js', '/__manifest.json']) {
  const r = await fetch(SITE + p, { cache: 'no-store' });
  show(`  ${p.padEnd(18)} → HTTP ${r.status}  ${(r.headers.get('content-type') || '').slice(0, 30)}  x-robots-tag=${r.headers.get('x-robots-tag') || '-'}`);
}
