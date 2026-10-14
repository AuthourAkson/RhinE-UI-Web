// 判定"本次进程到底走没走代理"：用我们域名的 /cdn-cgi/trace 看 Cloudflare 眼里的客户端 IP
//   202.97.145.x  → 你家宽带（真直连）
//   207.32.x      → 代理出口
const trace = async (label) => {
  const t0 = Date.now();
  try {
    const r = await fetch(`https://auak.dpdns.org/cdn-cgi/trace?ts=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const t = await r.text();
    const kv = Object.fromEntries(t.trim().split('\n').map((l) => l.split('=')).filter((p) => p.length === 2));
    console.log(`  ${label.padEnd(28)} ip=${String(kv.ip).padEnd(34)} loc=${kv.loc}  ${Date.now() - t0}ms`);
    return kv.ip;
  } catch (e) { console.log(`  ${label.padEnd(28)} ✗ ${e.name} ${Date.now() - t0}ms`); return null; }
};
const mode = process.env.NODE_USE_ENV_PROXY === undefined ? '未设置' : JSON.stringify(process.env.NODE_USE_ENV_PROXY);
console.log(`NODE_USE_ENV_PROXY=${mode}  HTTPS_PROXY=${process.env.HTTPS_PROXY || '(无)'}  HTTP_PROXY=${process.env.HTTP_PROXY || '(无)'}  ALL_PROXY=${process.env.ALL_PROXY || '(无)'}`);
await trace('当前环境');
