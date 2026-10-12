// 诊断：为什么找不到 #hud
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
console.log('页面目标:', list.filter((t) => t.type === 'page').map((t) => t.url));
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 60000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300);
  return r.result.value;
};
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8300/?demo=1&diag=1' });
await sleep(12000);
console.log('URL:', await ev('location.href'));
console.log('title:', await ev('document.title'));
console.log('body 子元素:', await ev(`JSON.stringify([...document.body.children].map(e => e.tagName + '#' + (e.id || '') + '.' + (e.className || '')))`));
console.log('#hud 存在:', await ev(`!!document.getElementById('hud')`));
console.log('#log 文本:', await ev(`(document.getElementById('log')||{}).textContent`));
console.log('hideHud 类型:', await ev(`typeof hideHud`));
console.log('错误:', await ev(`JSON.stringify((window.__ERRORS || []).slice(-3))`));
console.log('head 里 hud 样式:', await ev(`JSON.stringify([...document.querySelectorAll('style')].map(s => s.id || s.textContent.slice(0, 30)).slice(0, 5))`));
ws.close();
