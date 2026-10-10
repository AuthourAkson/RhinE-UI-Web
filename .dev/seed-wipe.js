(() => {
  // 模拟用户旧浏览器：把 seed 标记从 localStorage 设置里去掉，保留其它旧值
  try {
    const KEY = 'rhine:file:audio-archive-settings.json';
    const cur = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (cur) { delete cur.seed; localStorage.setItem(KEY, JSON.stringify(cur)); return '已去掉 seed 标记（模拟旧浏览器）'; }
    return 'localStorage 本来就没有设置';
  } catch (e) { return 'ERR ' + e.message; }
})()
