// 冷启动测量：禁用浏览器缓存 → 所有请求都走网络（"完全加载不进去"的真实场景）
// ⚠️ 传给页面 eval 的代码里**不能出现反引号**（会截断本文件的模板字符串），一律用字符串拼接。
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const urls = new Map(); const fails = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.requestWillBeSent') urls.set(m.params.requestId, m.params.request.url);
  if (m.method === 'Network.loadingFailed') fails.push({ u: urls.get(m.params.requestId) || '?', e: m.params.errorText });
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 300000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};

const MILESTONE = [
  '(function(){',
  '  var nav = performance.getEntriesByType("navigation")[0] || {};',
  '  var rs = performance.getEntriesByType("resource");',
  '  var byDir = {};',
  '  for (var i = 0; i < rs.length; i++) {',
  '    var p = new URL(rs[i].name).pathname, k;',
  '    if (p.indexOf("/themes/audio-archive/assets/frame") === 0 || p.indexOf("/fx") === 0) k = "开场影片";',
  '    else if (p.indexOf("/themes") === 0) k = "主题JS/素材";',
  '    else if (p.indexOf("/musiclab") === 0) k = "音频";',
  '    else if (p.indexOf("/shim") === 0 || p === "/app.js" || p === "/panel") k = "宿主代码";',
  '    else k = "其它";',
  '    byDir[k] = byDir[k] || { n: 0, kb: 0, ms: 0 };',
  '    byDir[k].n++; byDir[k].kb += (rs[i].transferSize || 0) / 1024; byDir[k].ms += rs[i].duration || 0;',
  '  }',
  '  var cls = [];',
  '  for (var k2 in byDir) cls.push(k2 + ": " + byDir[k2].n + "个/" + Math.round(byDir[k2].kb) + "KB/" + Math.round(byDir[k2].ms) + "ms");',
  '  var totalKB = 0; for (var j = 0; j < rs.length; j++) totalKB += (rs[j].transferSize || 0) / 1024;',
  '  return JSON.stringify({ ttfb: Math.round(nav.responseStart || 0), domReady: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0),',
  '    资源数: rs.length, 总KB: Math.round(totalKB), 分类: cls, 面板数: document.querySelectorAll("iframe").length }, null, 1);',
  '})()',
].join('\n');

const SLOWEST = [
  '(function(){',
  '  var rs = performance.getEntriesByType("resource").map(function(r){ return { n: r.name.replace(/^https?:\\/\\/[^/]+/, "").slice(0,58), ms: Math.round(r.duration), kb: +(r.transferSize/1024).toFixed(1) }; });',
  '  rs.sort(function(a,b){ return b.ms - a.ms; });',
  '  return rs.slice(0,12).map(function(r){ return "  " + String(r.ms).padStart(7) + "ms " + String(r.kb).padStart(8) + "KB  " + r.n; }).join("\\n");',
  '})()',
].join('\n');

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.clearBrowserCache');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
const t0 = Date.now();
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/?cold=1' });
await sleep(150000);
console.log('冷启动等待 ' + Math.round((Date.now() - t0) / 1000) + 's\n');
console.log('=== 里程碑与分类 ===');
console.log(await ev(MILESTONE));
console.log('\n=== 最慢 12 个请求 ===');
console.log(await ev(SLOWEST));
console.log('\n=== 失败的请求（共 ' + fails.length + '）===');
const byErr = {};
for (const f of fails) byErr[f.e] = (byErr[f.e] || 0) + 1;
for (const k of Object.keys(byErr)) console.log('  ' + String(byErr[k]).padStart(4) + ' × ' + k);
for (const f of fails.slice(0, 12)) console.log('     ' + f.u.replace(/^https?:\/\/[^/]+/, '').slice(0, 62));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
