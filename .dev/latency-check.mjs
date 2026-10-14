// 急救定位：直连（走国内家宽，与用户同一条路）测同域两个主机的耗时
//   门户 auak.dpdns.org        —— 我的规则不匹配它的路径，理论上不受影响
//   应用 rhine.auak.dpdns.org  —— 我改了 _headers / Worker / WAF 规则
// 若"门户快、应用慢" → 是我的改动；若"两个都慢" → 是网络/边缘问题
const targets = [
  ['门户首页', 'https://auak.dpdns.org/'],
  ['门户 API', 'https://auak.dpdns.org/api/list'],
  ['应用首页', 'https://rhine.auak.dpdns.org/'],
  ['面板 /panel', 'https://rhine.auak.dpdns.org/panel'],
  ['app.js', 'https://rhine.auak.dpdns.org/app.js'],
  ['音频(无 Referer)', 'https://rhine.auak.dpdns.org/musiclab/bombinsound.mp3'],
];
const one = async (label, url) => {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const b = await r.arrayBuffer();
    const ms = Math.round(performance.now() - t0);
    return { label, status: r.status, ms, kb: (b.byteLength / 1024).toFixed(1), cc: r.headers.get('cf-cache-status') || '-' };
  } catch (e) {
    return { label, status: 'ERR', ms: Math.round(performance.now() - t0), kb: '0', cc: e.name || e.message };
  }
};
for (const [label, url] of targets) {
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await one(label, url));
  const ok = runs.filter((r) => typeof r.status === 'number');
  const avg = ok.length ? Math.round(ok.reduce((a, b) => a + b.ms, 0) / ok.length) : -1;
  console.log(`${label.padEnd(16)} ${runs.map((r) => `${r.status}/${r.ms}ms`).join('  ')}   平均 ${avg}ms  ${runs[0].kb}KB  cf-cache=${runs[0].cc}`);
}
