// dist 验收：静态托管下能否正常启动、清单是否已瘦身、五视图是否都出图
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const reqs = new Map();
const consoleErrors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.responseReceived') reqs.set(m.params.requestId, m.params.response.url);
  if (m.method === 'Network.loadingFinished') { const u = reqs.get(m.params.requestId); if (u) reqs.set(m.params.requestId, { u, bytes: m.params.encodedDataLength }); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push((m.params.args[0] && m.params.args[0].value) || '');
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '').slice(0, 120));
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 90000); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result.value;
};
const fs = await import('node:fs');

await send('Network.enable');
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 899, deviceScaleFactor: 1.5, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8310/' });
await sleep(22000);

const rows = [...reqs.values()].filter((r) => r && r.bytes !== undefined);
const total = rows.reduce((n, r) => n + r.bytes, 0) / 1048576;
const mf = rows.filter((r) => r.u.includes('__manifest'));
console.log('=== dist 静态托管验收 ===');
console.log('面板状态:', await ev(`(function(){
  const out = {};
  for (const f of document.querySelectorAll('iframe')) { try { out[f.dataset.id] = f.contentWindow.__ready ? 'ready' : '未就绪'; } catch (e) { out[f.dataset.id] = 'EXC'; } }
  return JSON.stringify(out);
})()`));
console.log('错误数:', consoleErrors.length, consoleErrors.slice(0, 4));
console.log('请求数:', rows.length, ' 传输:', total.toFixed(2), 'MB');
console.log('__manifest.json:', mf.length, '次', mf.map((r) => (r.bytes / 1024).toFixed(0) + ' KB').join(' / '));
console.log('最大 6 个请求:');
for (const r of rows.sort((a, b) => b.bytes - a.bytes).slice(0, 6)) console.log('  ' + String(Math.round(r.bytes / 1024)).padStart(5) + ' KB  ' + r.u.replace('http://127.0.0.1:8310', ''));

// 清单里不应再有 .dev
console.log('\n清单里的 .dev 条目:', await ev(`(async () => {
  const m = await (await fetch('/__manifest.json')).json();
  const dev = Object.keys(m.text).filter(k => k.startsWith('.dev/'));
  return 'text ' + Object.keys(m.text).length + ' 个，.dev ' + dev.length + ' 个；files ' + m.files.length + ' 个；root=' + JSON.stringify(m.root);
})()`));

// 五视图
for (const [key, name] of [['1', 'archive'], ['2', 'playlists'], ['3', 'lyrics'], ['4', 'signal'], ['5', 'style']]) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: 'Digit' + key, windowsVirtualKeyCode: 48 + Number(key) });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: 'Digit' + key, windowsVirtualKeyCode: 48 + Number(key) });
  await sleep(2200);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`D:\\AgentTestLab\\RhinE-UI\\.dev\\dist-${name}.png`, Buffer.from(shot.data, 'base64'));
}
console.log('\n已存 dist-archive/playlists/lyrics/signal/style.png');
console.log('最终错误数:', consoleErrors.length, consoleErrors.slice(0, 3));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
