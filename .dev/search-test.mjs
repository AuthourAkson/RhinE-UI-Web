// 搜索功能验证：在播放列表视图里搜 "world" → 应建出 "Search" 自动播放列表并显示结果
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 90000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const S = (code) => ev(`document.querySelector('iframe[data-id="stage"]').contentWindow.eval(${JSON.stringify(code)})`);
const H = (code) => ev(`document.querySelector('iframe[data-id="header"]').contentWindow.eval(${JSON.stringify(code)})`);
const P = (code) => ev(`document.querySelector('iframe[data-id="playlist"]').contentWindow.eval(${JSON.stringify(code)})`);
const fs = await import('node:fs');

await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await ev('location.assign("http://127.0.0.1:8300/?demo=1&search=1")');
await sleep(17000);

console.log('=== 先看查询/排序的纯函数（不依赖界面）===');
console.log(await S(`(function(){
  const q1 = searchQuery('world'), q2 = searchQuery('mili radio');
  return JSON.stringify({ world的查询: q1, 两个词的查询: q2 });
})()`));

console.log('\n=== 播放列表视图里执行搜索 ===');
await S('send("view","playlists"); "ok"');
await sleep(2500);
console.log('搜索前列表:', await ev('JSON.stringify(window.__RHINE_DEBUG__.LIB.playlists.map(p => p.name + "(" + p.items.length + ")"))'));
console.log('调用 applySearch（模拟搜索框输入 world）:', await H(`(function(){
  search.text = 'world'; applySearch();
  return JSON.stringify({ 查询: searchQuery('world'), 之后的活动列表: plman.ActivePlaylist });
})()`));
await sleep(2500);
console.log('搜索后列表:', await ev('JSON.stringify(window.__RHINE_DEBUG__.LIB.playlists.map(p => ({ 名: p.name, 数: p.items.length, 自动: !!p.auto, 曲目: p.items.map(i => window.__RHINE_DEBUG__.LIB.tracks[i].title) })))'));
console.log('IsAutoPlaylist(新列表) =', await P('(function(){ const i = plman.FindPlaylist("Search"); return i + " → " + plman.IsAutoPlaylist(i); })()'));
console.log('播放列表面板显示:', await P(`(function(){
  const rows = [...document.querySelectorAll('.prow')].filter(r => r.style.display !== 'none' && !r.classList.contains('group'));
  return JSON.stringify(rows.map(r => [...r.children].map(c => (c.textContent||'').trim()).join(' | ')));
})()`));

// 再搜第二个词，验证旧列表被替换而不是堆积
console.log('\n=== 再搜 "bomb"（应替换而不是新增）===');
await H(`(function(){ search.text = 'bomb'; applySearch(); return 'ok'; })()`);
await sleep(2500);
console.log('列表:', await ev('JSON.stringify(window.__RHINE_DEBUG__.LIB.playlists.map(p => p.name + "(" + p.items.length + ")"))'));
console.log('Search 里的曲目:', await ev(`(function(){ const p = window.__RHINE_DEBUG__.LIB.playlists.find(x => x.name === 'Search'); return p ? JSON.stringify(p.items.map(i => window.__RHINE_DEBUG__.LIB.tracks[i].title)) : '没有 Search 列表'; })()`));

// 搜不到东西时
console.log('\n=== 搜一个不存在的词 ===');
await H(`(function(){ search.text = 'zzzznotfound'; applySearch(); return 'ok'; })()`);
await sleep(2500);
console.log('列表:', await ev('JSON.stringify(window.__RHINE_DEBUG__.LIB.playlists.map(p => p.name + "(" + p.items.length + ")"))'));
console.log('界面提示:', await P(`(function(){ const e = [...document.querySelectorAll('.prow,.empty,.pl-empty')].map(x => (x.textContent||'').trim()).filter(Boolean); return JSON.stringify(e.slice(0, 4)); })()`));

// 恢复成 world 并截图
await H(`(function(){ search.text = 'world'; applySearch(); return 'ok'; })()`);
await sleep(2500);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:\\AgentTestLab\\RhinE-UI\\.dev\\search-world.png', Buffer.from(shot.data, 'base64'));
console.log('\n已存 .dev/search-world.png');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
