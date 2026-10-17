// 定位翻译链路：在**线上页面**里分别验证 ① ActiveX 兼容层 ② /api/tr 代理 ③ 主题的 trHttp
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 150));
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 240000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 250) : r.result.value; };
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'https://rhine.auak.dpdns.org/?probe=tr' });
await sleep(24000);
await S('send("view","lyrics"); "ok"');
await sleep(2000);

console.log('=== ① shim 的 ActiveXObject 兼容层是否存在 ===');
console.log(await S(`(function(){ try { return 'typeof=' + typeof window.ActiveXObject + '  trHttp=' + (typeof trHttp) + '  neteaseFetch=' + (typeof neteaseFetch); } catch(e){ return 'EXC ' + e.message; } })()`));

console.log('\n=== ② 直接用 MSXML2 发一次网易云搜索（走兼容层 + /api/tr）===');
console.log(await S(`(function(){
  return new Promise(function(resolve){
    try {
      var out = { 阶段: '开始' };
      var x = new ActiveXObject('MSXML2.XMLHTTP.6.0');
      x.open('GET', 'https://music.163.com/api/cloudsearch/pc?type=1&limit=3&s=' + encodeURIComponent('world.execute me Mili'), true);
      x.onreadystatechange = function(){
        if (x.readyState === 4) { out.状态 = x.status; out.长度 = (x.responseText||'').length; out.开头 = (x.responseText||'').slice(0,120).replace(/\\s+/g,' '); resolve(JSON.stringify(out)); }
      };
      x.send(null);
      setTimeout(function(){ if (!out.状态 && out.状态 !== 0) { out.阶段 = '超时'; resolve(JSON.stringify(out)); } }, 20000);
    } catch(e) { resolve('EXC ' + e.message); }
  });
})()`));

console.log('\n=== ③ 直接 fetch 同源代理（绕开兼容层，验证 Worker 路由）===');
console.log(await S(`(async function(){
  try {
    var u = 'https://music.163.com/api/song/lyric?id=435278010&lv=1&tv=-1';
    var r = await fetch('/api/tr?u=' + encodeURIComponent(u), { cache: 'no-store' });
    var t = await r.text();
    return 'HTTP ' + r.status + '  ' + t.length + ' 字节  含tlyric=' + t.includes('tlyric');
  } catch(e) { return 'EXC ' + e.message; }
})()`));
console.log('\n控制台错误:', errs.length, errs.slice(0, 4));
ws.close();
