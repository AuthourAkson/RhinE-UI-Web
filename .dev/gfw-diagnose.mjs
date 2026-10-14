// 分层诊断：DNS → TCP(443) → TLS → HTTP → 持续吞吐
// 对照三组目标，判断到底是"你这条线被墙"还是"Cloudflare 那几个 IP 被限速"
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';

const TARGETS = [
  ['① 国内对照', 'www.baidu.com'],
  ['① 国内对照', 'www.qq.com'],
  ['② 非 CF 国外', 'github.com'],
  ['② 非 CF 国外', 'www.apple.com'],
  ['② 非 CF 国外', 'www.microsoft.com'],
  ['③ 我们的 CF', 'rhine.auak.dpdns.org'],
  ['③ 我们的 CF', 'auak.dpdns.org'],
  ['③ 我们的 CF', 'www.cloudflare.com'],
];

const tcpTest = (ip, port = 443, timeout = 6000) => new Promise((res) => {
  const t0 = Date.now();
  const s = net.connect({ host: ip, port });
  const done = (r) => { try { s.destroy(); } catch (e) { } res({ ok: r, ms: Date.now() - t0 }); };
  s.setTimeout(timeout);
  s.on('connect', () => done(true));
  s.on('timeout', () => done('超时'));
  s.on('error', (e) => done('错:' + e.code));
});

const tlsTest = (ip, servername, timeout = 8000) => new Promise((res) => {
  const t0 = Date.now();
  const s = tls.connect({ host: ip, port: 443, servername, rejectUnauthorized: false });
  const done = (r) => { try { s.destroy(); } catch (e) { } res({ ok: r, ms: Date.now() - t0 }); };
  s.setTimeout(timeout);
  s.on('secureConnect', () => done(true));
  s.on('timeout', () => done('超时'));
  s.on('error', (e) => done('错:' + e.code));
});

console.log('目标'.padEnd(30) + 'DNS 解析'.padEnd(26) + 'TCP:443'.padEnd(16) + 'TLS');
console.log('-'.repeat(92));
for (const [group, host] of TARGETS) {
  let ips = [];
  try { ips = await dns.promises.resolve4(host); } catch (e) { ips = ['ERR ' + e.code]; }
  if (ips[0] === '127.0.0.1' || /^0\./.test(ips[0] || '')) ips.push('(疑似污染)');
  const tcp = await tcpTest(ips[0]);
  const tlsR = tcp.ok === true ? await tlsTest(ips[0], host) : { ok: '跳过', ms: 0 };
  const fmt = (r) => (r.ok === true ? `✓ ${r.ms}ms` : `✗ ${r.ok} ${r.ms}ms`);
  console.log(`${(group + ' ' + host).padEnd(30)}${ips.slice(0, 2).join(',').slice(0, 24).padEnd(26)}${fmt(tcp).padEnd(16)}${fmt(tlsR)}`);
}

// 持续吞吐：连上之后能不能真的传数据（被限速时典型表现是"TCP 通、一传就停"）
console.log('\n=== 持续下载 200KB 测速（识别"连得上但传不动"）===');
const rate = async (label, url) => {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const reader = r.body.getReader();
    let got = 0;
    while (got < 200 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.byteLength;
    }
    try { await reader.cancel(); } catch (e) { }
    const ms = Date.now() - t0;
    console.log(`  ${label.padEnd(34)} 收到 ${(got / 1024).toFixed(0)}KB / ${ms}ms  =  ${((got / 1024) / (ms / 1000)).toFixed(1)} KB/s`);
  } catch (e) {
    console.log(`  ${label.padEnd(34)} ✗ ${e.name} ${Date.now() - t0}ms`);
  }
};
await rate('百度首页图标（国内对照）', 'https://www.baidu.com/img/flexible/logo/pc/result.png');
await rate('GitHub 一个 200KB 文件', 'https://raw.githubusercontent.com/git/git/master/README.md');
await rate('我们的清单 __manifest.json 307KB', 'https://rhine.auak.dpdns.org/__manifest.json');
await rate('Cloudflare 自家 cdnjs 文件', 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js');
