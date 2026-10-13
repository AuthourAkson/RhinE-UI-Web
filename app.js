/**
 * app.js —— 网页版宿主：扮演 Columns UI 的"面板容器"角色
 *
 * 原始架构（foobar2000 / Columns UI / JSplitter）：
 *   Columns UI 按 .fcl 布局创建面板；根面板 frame.js 拿到所有子面板对象，
 *   自己算布局（regions()）并用 p.Move() / p.Show() 摆位。
 *
 * 网页版对应关系：
 *   Columns UI 面板容器  →  本文件（绝对定位的 iframe 列表）
 *   子面板               →  <iframe>（各自一份全局作用域）
 *   根面板 frame.js      →  同样跑在 iframe 里，通过 GetPanelByIndex(i) 拿到父页面里的 PanelObject
 *   window.NotifyOthers  →  父页面转发（主题发的是 JSON 字符串，天然可跨 frame）
 */
const CHILDREN = ['header', 'transport', 'stage', 'manager', 'head', 'playlist', 'card', 'tip', 'fx'];

const PANELS = [];        // PanelObject[]，索引 = frame.js 里 CHILDREN 的顺序
const BY_ID = new Map();
const IFRAMES = new Map();

let manifest = null;
let rootPanel = null;

/* ------------------------------------------------------------------ 工具 -- */
const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------------ 左下角 HUD --
 * 它是"状态条 + 两个开发按钮"，成品里不该一直占着画面。
 * 逻辑：每次 log() 都重置计时，**安静 4 秒后自动淡出**（加载期间日志连续，所以不会中途消失；
 * 最后一次"面板就绪"之后 4 秒收起 = 一次加载完毕）。
 * 藏起来之后按 **Alt+H** 随时唤回（Preferences › 快捷键里也列了这一条）。
 * 注意：只是 display:none，文本仍在，自动化测试照样能读 #log 的内容。
 */
let hudTimer = 0, hudHidden = false;
function hideHud() {
  const h = $('#hud');
  if (!h || hudHidden) return;
  hudHidden = true;
  h.style.transition = 'opacity .45s ease';
  h.style.opacity = '0';
  setTimeout(() => { if (hudHidden) h.style.display = 'none'; }, 470);
}
function showHud(keep) {
  const h = $('#hud');
  if (!h) return;
  hudHidden = false;
  h.style.display = '';
  requestAnimationFrame(() => { h.style.opacity = '1'; });
  clearTimeout(hudTimer);
  if (keep !== true) hudTimer = setTimeout(hideHud, 4000);   // 唤回后 4 秒再收起
}
function hudIdle() {                     // 每次有新状态就重新计时
  clearTimeout(hudTimer);
  if (!hudHidden) hudTimer = setTimeout(hideHud, 4000);
}

function log(msg) {
  const el = $('#log');
  if (el) el.textContent = msg;
  (window.__ERRORS ||= []).push(msg);
  console.log(msg);
  try { hudIdle(); } catch (e) { }
}

/**
 * 顶层文档 + 每个同源面板文档各挂一份键盘监听。
 * 为什么不能只挂顶层：整个界面是 iframe，键盘焦点通常在某个面板里（Preferences 的 Esc 就踩过这个坑）。
 * 面板会因语言/模式切换而重载 → 监听随之丢失，所以面板 ready 时会再挂一次（见 ready 分支）。
 */
function onKeyEverywhere(handler, capture = true) {
  const targets = [document];
  for (const p of PANELS) {
    try { if (p.__frame && p.__frame.contentWindow) targets.push(p.__frame.contentWindow.document); } catch (e) { }
  }
  for (const d of targets) { try { d.addEventListener('keydown', handler, capture); } catch (e) { } }
}
/** Alt+H 唤回左下角状态条（它加载完会自动隐藏） */
function onHudKey(e) {
  if (e.altKey && (e.key === 'h' || e.key === 'H' || e.code === 'KeyH')) {
    e.preventDefault(); e.stopPropagation();
    showHud();
  }
}

/* --------------------------------------------------- 内置 demo 曲库的入口按钮 --
 * 主题的档案页在"空库空态"会画一个 `+ ADD MUSIC FOLDER`（archive.js:762，条件 LIB.live && !LIB.filter），
 * 命中区名 ar-addmusic。我们想在它**下方**再放一个「载入默认音乐 Demo」——
 * 但主题 JS 必须与原版逐字节一致（不能改它加按钮），所以由宿主在**顶层文档**画一个
 * 位置跟随 ar-addmusic 的浮层按钮：
 *   · 轮询 stage 面板的 STATE.view 与 hits.get('ar-addmusic')
 *   · 只有档案视图 + 空库空态（那个命中区存在）时才显示 —— 与主题自己的入口同生共死
 *   · 颜色/字号取自主题的 tokens（C.fg / C.bg / AR_ST.btn），所以深浅色自动一致
 */
let demoBtn = null, demoPoll = 0;
/**
 * 开场影片（fx 面板）是否已经放完。
 * 主题 fx.js 的 endBoot() 会 send("boot-end")，这里收下当信号 ——
 * 否则 demo 按钮画在顶层文档、z-index 比 fx 那个 iframe 高，影片还在放就盖在上面了（用户实测）。
 * 另留一条兜底：fx 面板被隐藏也算放完（万一 boot-end 因为影片素材缺失没发出来）。
 */
let introDone = false;
function argbToCss(v) {
  const n = Number(v) >>> 0;
  return `rgb(${(n >>> 16) & 255},${(n >>> 8) & 255},${n & 255})`;
}
function ensureDemoBtn() {
  if (demoBtn) return demoBtn;
  demoBtn = document.createElement('button');
  demoBtn.id = 'rhine-demo-btn';
  demoBtn.style.cssText = 'position:absolute;z-index:2147482000;display:none;cursor:pointer;border:0;'
    + 'font-family:"Geist Mono","Microsoft YaHei UI",monospace;letter-spacing:.14em;font-weight:600;'
    + 'padding:0 18px;white-space:nowrap';
  demoBtn.onclick = () => {
    log(ht('Loading the built-in demo library…'));
    loadHttpLibrary().catch((e) => log(ht('Loading the demo library failed: {0}', e.message)));
  };
  document.body.appendChild(demoBtn);
  return demoBtn;
}
function updateDemoBtn() {
  const btn = ensureDemoBtn();
  const D = (window.__DEMO_DEBUG__ ||= { posts: 0, chan: {}, types: [], calls: 0, lastHit: null, lastErr: '' });
  D.calls++;
  const fx = PANELS.find((p) => p.__id === 'fx');
  // 开场影片是否**正在放**：直接读 fx.js 自己的 boot.ended（首次播放和重播都准）。
  // ⚠️ 不能用 `fx 面板 display !== 'none'` 判断：影片放完后那个 iframe 依然是可见的透明浮层
  //    （实测切视图时它一直"可见"→ 按钮被卡住 700ms 才出现，用户反馈的"延迟一下"就是这个）。
  let filmPlaying = false;
  const fxWin = fx && fx.__frame && fx.__frame.contentWindow;
  if (fxWin) {
    try { filmPlaying = !!fxWin.eval('typeof boot !== "undefined" && boot.started && !boot.ended'); } catch (e) { filmPlaying = false; }
  }
  if (filmPlaying && !introDone) { D.why = 'fx影片中'; btn.style.display = 'none'; return; }
  const stage = PANELS.find((p) => p.__id === 'stage');
  const w = stage && stage.__frame && stage.__frame.contentWindow;
  if (!w || getComputedStyle(stage.__frame).display === 'none') { D.why = 'stage不可见'; btn.style.display = 'none'; return; }
  let info = null;
  try {
    info = w.eval(`(function(){
      try {
        if (typeof STATE === "undefined" || STATE.view !== "archive") return null;
        var h = hits.get("ar-addmusic");
        if (!h) return null;
        return JSON.stringify({ h: h, fg: C.fg, bg: C.bg, size: (typeof stSize === "function") ? stSize(AR_ST.btn) : 13 });
      } catch (e) { return null; }
    })()`);
  } catch (e) { info = null; }
  if (!info) { D.lastHit = false; D.why = 'eval没命中'; btn.style.display = 'none'; return; }
  D.lastHit = true; D.why = '显示';
  const d = JSON.parse(info);
  const r = stage.__frame.getBoundingClientRect();
  // ⚠️ 手机模式下 #stage 被整体 scale 了（虚拟桌面 1440×820 → 屏幕），而 d.h 是**主题的虚拟坐标**：
  //    rect 已含缩放、命中区没有 → 不乘缩放的话按钮会跑到屏幕外（用户实测"载入音乐库的按钮超出屏幕"）。
  //    scale 从「rect 宽 ÷ 主题实际逻辑宽」得到，电脑上恒为 1，因此电脑端逐像素不变。
  let msc = 1;
  try {
    const vw = Number(w.eval('(function(){ try { return W; } catch(e){ return 0; } })()')) || 0;
    if (vw > 0 && r.width > 0) msc = r.width / vw;
  } catch (e) { msc = 1; }
  // 按钮本身不缩放（要保持可点、字号可读），只把锚点换算到屏幕坐标；缩小时给一个可点下限
  const bw = Math.max(0, btn.offsetWidth || 0);
  const leftV = r.left + d.h.x * msc;
  const rightEdge = r.left + r.width;
  btn.textContent = ht('+ LOAD DEFAULT AUDIO LIBRARY');
  btn.style.left = Math.round(Math.min(Math.max(leftV, 4), Math.max(4, rightEdge - bw - 4))) + 'px';
  btn.style.top = Math.round(r.top + (d.h.y + d.h.h) * msc + 10) + 'px';
  btn.style.height = Math.max(26, Math.round(d.h.h * Math.min(msc, 1))) + 'px';   // 手机上别挤成一条
  btn.style.background = argbToCss(d.fg);        // 与主题的实心按钮一致：前景色底 + 底色文字
  btn.style.color = argbToCss(d.bg);
  btn.style.fontSize = Math.min(d.size, Math.max(11, Math.round(d.size * Math.min(msc, 1)))) + 'px';
  btn.style.display = 'block';
}
function startDemoPoll() {
  clearInterval(demoPoll);
  // 主路径是事件驱动（BUS.post 里解析 audio-archive 频道里的 view/state 消息，切视图立刻响应）；
  // 这个轮询只当兜底（窗口尺寸变化、面板重排等不发消息的情况），所以放慢到 300ms。
  demoPoll = setInterval(() => { try { updateDemoBtn(); } catch (e) { } }, 300);
  window.addEventListener('resize', () => { try { updateDemoBtn(); } catch (e) { } });
  setTimeout(() => { try { updateDemoBtn(); } catch (e) { } }, 300);   // 启动后先摆一次
}

/* ------------------------------------------------------- 宿主自己的界面文案 --
 * 主题的界面语言存在设置文件里（uiLang，由菜单 › Audio Archive › Language 切换）。
 * 宿主自己画的东西（网页版首选项、HUD 按钮、底部状态行）也必须跟随它，
 * 否则切成英文后这些地方还是中文（用户实测："切换语言后里面还是中文"）。
 * 约定与主题的 lib/i18n.js 完全一致：**英文原文即 key**，没有翻译就保持英文。
 */
const HOST_LANGS = ['en', 'zh-CN', 'ja'];
function hostLang() {
  // ⚠️ 必须与主题 getSetting('uiLang', 系统语言) **完全同序**，否则同一界面里两种语言：
  //    localStorage 覆盖层 → 仓库默认设置文件（清单里的 audio-archive-settings.json）→ 系统语言。
  //    之前只看了第一层，于是"默认改成英文"之后主题是英文、宿主的 HUD 还是中文（实测）。
  try {
    const raw = localStorage.getItem('rhine:file:audio-archive-settings.json');
    const set = raw ? String(JSON.parse(raw).uiLang || '') : '';
    if (HOST_LANGS.includes(set)) return set;
  } catch (e) { }
  try {
    const def = manifest && manifest.text && manifest.text['audio-archive-settings.json'];
    const set = def ? String(JSON.parse(def).uiLang || '') : '';
    if (HOST_LANGS.includes(set)) return set;
  } catch (e) { }
  let sys = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
  sys = /^zh-(tw|hk|mo|hant)/.test(sys) ? 'zh-CN' : /^zh/.test(sys) ? 'zh-CN'
    : (['ja', 'ko', 'de', 'fr'].includes(sys.split('-')[0]) ? sys.split('-')[0] : 'en');
  return HOST_LANGS.includes(sys) ? sys : 'en';
}
const HOST_I18N = {
  'zh-CN': {
    // HUD（开发用小工具）
    'Pick element': '拾取元素',
    'Hide': '隐藏',
    'Pick mode on: click anywhere (or hold Alt and click); the result is printed and copied to the clipboard': '拾取模式已开：点画面上任意位置（或按住 Alt 点击），结果会打印并复制到剪贴板',
    'Pick mode off': '拾取模式已关',
    // 网页版首选项
    'PREFERENCES · Web preferences': 'PREFERENCES · 网页版首选项',
    'In the original this is foobar2000’s native preferences': '原版这里是 foobar2000 的原生设置',
    'Library / MEDIA LIBRARY': '曲库 / MEDIA LIBRARY',
    'Source': '来源',
    'Tracks / albums': '曲目 / 专辑',
    'Duration / size': '总时长 / 体积',
    'Choose music folder…': '选音乐文件夹…',
    'Rescan': '重新扫描',
    'Load demo library': '载入演示曲库',
    'Demo library (?demo=1)': '演示曲库（?demo=1）',
    'Local folder (File System Access)': '本地文件夹（File System Access）',
    'Not loaded': '未载入',
    'Note: folder-handle persistence (IndexedDB) is not implemented yet, so a rescan asks for the folder again.': '说明：本地文件夹的目录句柄持久化（IndexedDB）还没做，重扫需要重新选一次目录。',
    'Cache / CACHE': '缓存与设置 / CACHE',
    'Waveform cache': '波形缓存',
    'Decoded whole-track waveforms live in each panel’s memory (clear to recompute)': '解码后的整轨波形存在各面板内存里（配合「清空」重算）',
    'Clear waveform / cover cache': '清空波形 / 封面缓存',
    'Reset all settings…': '恢复默认设置…',
    'Clear all settings (colour scheme / view / skin / interface language…) and reload?': '清空全部设置（配色方案 / 视图 / 皮肤 / 界面语言…）并重新载入？',
    'Shortcuts / SHORTCUTS': '快捷键 / SHORTCUTS',
    'Switch between the five views (Archive / Playlists / Lyrics / Signal / Style)': '切换五个视图（档案 / 播放列表 / 歌词 / 信号 / 外观）',
    'Light / dark': '浅色 / 深色',
    'Playlist preset Album ⇄ Index': '播放列表预设 Album ⇄ Index',
    'Play the intro film': '播放开场影片',
    'Shuffle the whole library': '整库随机播放',
    'Random pick in the Archive': '档案视图里随机抽取',
    'Inspect the current album': '查看 / 检查当前专辑',
    'Search (filters the Archive in place; other views create a Search playlist)': '搜索（档案视图里就地过滤，其它视图建 Search 列表）',
    'Leave the search / close overlays': '退出搜索 / 关闭浮层',
    'Show the status bar again (it hides itself once loading finishes)': '重新显示底部状态条（加载完成后会自动隐藏）',
    'Play / pause': '播放 / 暂停',
    'About / ABOUT': '关于 / ABOUT',
    'Theme version': '主题版本',
    'Port': '移植',
    'Manifest built': '清单构建于',
    'Panels': '面板',
    'Viewport / scale': '视口 / 缩放',
    'Browser': '浏览器',
    'Rendering': '渲染',
    'RhinE-UI · theme JS byte-identical to the original 1.4.0': 'RhinE-UI · 主题 JS 与原版 1.4.0 逐字节一致',
    'Fonts loaded': '字体已加载',
    'Fonts not loaded': '字体未加载',
    'Opened the web preferences': '打开网页版首选项',
    // 底部状态行里面向用户的那几条
    'Music library ready: {0} files (source {1}) → asking the panels to re-index': '媒体库就绪：{0} 个文件（来源 {1}）→ 通知面板重新索引',
    'Library indexed: {0} tracks / {1} albums ({2} ms)': '曲库解析完成：{0} 首 / {1} 张专辑（解析 {2} ms）',
    'HTTP library: {0} files': 'HTTP 曲库：{0} 个文件',
    'Loading the demo library failed: {0}': '加载演示曲库失败：{0}',
    'Loading the built-in demo library…': '正在载入内置音频库…',
    '+ LOAD DEFAULT AUDIO LIBRARY': '+ 载入默认音频库',
    'Playing: {0}': '播放：{0}',
    'Playback failed: {0} (the browser may not support this format)': '播放失败：{0}（浏览器可能不支持该格式）',
    'Choosing a folder was cancelled': '已取消选择目录',
    'Scanning the folder…': '正在扫描目录…',
    'Scan finished: {0} audio files': '扫描完成：{0} 个音频文件',
    'Scan finished: {0} audio files, {1} text sidecars': '扫描完成：{0} 个音频文件、{1} 个同名文本（歌词等）',
    'This browser has no File System Access API — use Chrome or Edge': '此浏览器不支持 File System Access API，请用 Chrome/Edge',
    'Settings restored to defaults, reloading…': '设置已恢复默认，正在重新载入…',
    'Cache cleared: {0} entries (waveforms are decoded again next time the Signal view opens)': '已清空缓存：{0} 条（波形会在下次进入 SIGNAL 视图时重新解码）',
    'Re-scanning the library…': '重新扫描曲库…',
    'Mode switched → {0}': '模式切换 → {0}',
    'Colour scheme → {0} ({1})': '配色方案 → {0}（{1}）',
    'Panel ready: {0} ({1} callbacks, {2} ms)': '面板就绪：{0}（{1} 个回调，{2} ms）',
    'Track {0} has no playable source': '第 {0} 首没有可播放来源',
    'Removed {0} playlist items': '播放列表移除 {0} 项',
    'Playlist renamed → {0}': '播放列表改名 → {0}',
    'Auto playlist “{0}”: {1} tracks': '自动播放列表「{0}」：{1} 首',
    'Playlist deleted (was index {0})': '播放列表已删除（原下标 {0}）',
  },
};
/** ht('English text', ...args) —— 缺翻译就用英文原文（与主题 tr() 同一约定） */
function ht(s, ...args) {
  const t = HOST_I18N[hostLang()];
  let out = (t && typeof t[s] === 'string') ? t[s] : s;
  if (args.length) out = out.replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined ? m : String(args[i])));
  return out;
}
/** HUD 的按钮文案（index.html 里是静态中文，这里按当前语言改写；开发用小工具） */
function applyHostLang() {
  const pick = $('#pick-btn'), hide = $('#hide-btn');
  if (pick) {
    pick.textContent = ht('Pick element');
    pick.title = ht('Pick mode on: click anywhere (or hold Alt and click); the result is printed and copied to the clipboard');
  }
  if (hide) hide.textContent = ht('Hide');
}


/* ------------------------------------------------- 面板对象（PanelObject） -- */
function makePanel(id, title, index) {
  const frame = document.createElement('iframe');
  frame.className = 'panel';
  frame.dataset.id = id;
  frame.src = '/panel.html';
  frame.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;border:0;display:none;visibility:hidden';
  $('#stage').appendChild(frame);

  const p = {
    __id: id, __index: index, __frame: frame,
    Text: title,
    ShowCaption: false, Locked: true, TopMost: false, Visible: false, IsVisible: false,
    MinWidth: 0, MaxWidth: 0, MinHeight: 0, MaxHeight: 0, InstanceCount: 1, HideWithParent: true,
    /* Columns UI 的面板 API → 直接改 iframe 的几何 */
    Show(on) {
      p.Visible = p.IsVisible = !!on;
      frame.style.display = on ? 'block' : 'none';
      frame.style.visibility = on ? 'visible' : 'hidden';
    },
    Move(x, y, w, h) {
      p.x = x; p.y = y; p.w = w; p.h = h;
      frame.style.left = x + 'px'; frame.style.top = y + 'px';
      frame.style.width = w + 'px'; frame.style.height = h + 'px';
      const win = frame.contentWindow;
      if (p.__ready && win) win.__rhine && win.__rhine.size(w, h);
    },
    Hide() { p.Show(false); },
    // 网页版没有"面板设置对话框"，这些是主题会调的配置接口
    GetColourCUI: () => 0, SetColourCUI: () => { }, GetFontCUI: () => null, SetFontCUI: () => { },
    GetProperty: (n, d) => d, SetProperty: () => { }, NotifyOthers: () => { },
  };
  BY_ID.set(id, p);
  return p;
}

/* 原生播放列表面板（Columns UI 的 Playlist View）在网页版里由 native/playlist.js 用 DOM 实现 ——
   见 main() 里的面板创建；这里只保留它需要的宿主状态与命令（LIB.selection 等）。 */

/* ------------------------------------------------------ 跨面板消息总线 -- */
const BUS = {
  // 缓存"共享状态"类消息：后启动的面板错过了广播就补发一条
  // （原因：网页版里所有面板并行启动，而 JSplitter 里根面板是最后启动的，
  //   于是根面板的第一次 broadcast() 会早于某些子面板就绪 —— 实测 stage 因此停在
  //   默认 view=playlists，on_paint 里四个视图分支都不匹配，画面全黑）
  cached: new Map(),
  post(fromId, name, info) {
    // 排查用的小计数（只增不减，几十字节）：看主题消息到底进没进宿主
    const D = (window.__DEMO_DEBUG__ ||= { posts: 0, chan: {}, types: [], calls: 0, lastHit: null, lastErr: '' });
    D.posts++; D.chan[name] = (D.chan[name] || 0) + 1;
    try { const t = JSON.parse(info); if (t && t.type) { D.types.push(t.type); if (D.types.length > 20) D.types.shift(); } } catch (e) { }
    // 开场影片放完的信号（主题 fx.js endBoot() → send("boot-end")）。
    // ⚠️ 和 view 一样：type 在 info 的 JSON 里，name 只是频道名（audio-archive）——
    //    之前按 name 比，introDone 永远是 false。
    if (name === 'audio-archive') {
      try { const m0 = JSON.parse(info); if (m0 && m0.type === 'boot-end') introDone = true; } catch (e) { }
    }
    if (name === 'audio-archive') {
      // ⚠️ 主题的 send(type, data) 是 window.NotifyOthers(BUS, JSON.stringify({type, data}))：
      //    宿主拿到的 name 是**频道名**（audio-archive），type 在 info 的 JSON 里。
      //    之前我在外面比 name === 'view'，永远不匹配 —— 表现为切回档案视图要等 700ms 轮询才出现。
      try {
        const m0 = JSON.parse(info);
        if (m0 && (m0.type === 'view' || m0.type === 'state')) {
          // 连打一串重试：主题要先重排/重画**空态**才会注册 ar-addmusic 命中区
          // （实测命中区 36ms 就出现，所以这里跟着它走，差值应在一帧内）
          for (const t of [20, 60, 120, 240, 480, 900]) setTimeout(() => { try { updateDemoBtn(); } catch (e) { } }, t);
        }
      } catch (e) { }
      try { const m = JSON.parse(info); if (m && m.type === 'state') BUS.cached.set('state', info); } catch (e) { }
    }
    for (const [id, frame] of IFRAMES) {
      if (id === fromId) continue;
      const win = frame.contentWindow;
      if (win && win.__rhine) win.__rhine.call('on_notify_data', name, info);
    }
  },
  /** 面板刚就绪：把它错过的共享状态补上 */
  catchUp(panelId) {
    const frame = IFRAMES.get(panelId);
    const win = frame && frame.contentWindow;
    if (!win || !win.__rhine) return;
    const info = BUS.cached.get('state');
    if (info) win.__rhine.call('on_notify_data', 'audio-archive', info);
  },
};

/* ------------------------------------------------------------- 启动流程 -- */
async function preloadFonts() {
  const faces = [
    ['Geist Mono Light', 'Light', 300], ['Geist Mono', 'Regular', 400], ['Geist Mono Medium', 'Medium', 500],
    ['Geist Mono SemiBold', 'SemiBold', 600], ['Geist Mono', 'Bold', 700],
  ];
  const jobs = faces.map(async ([family, file, weight]) => {
    try {
      const f = new FontFace(family, `url(/themes/audio-archive/assets/fonts/GeistMono-${file}.ttf)`, { weight: String(weight) });
      document.fonts.add(await f.load());
    } catch (e) { console.warn('字体加载失败', family, e.message); }
  });
  await Promise.all(jobs);
  await document.fonts.ready;
  log(`字体就绪：${document.fonts.size} 个 FontFace`);
}

function bootPanel(p, entry, extra = {}) {
  const frame = p.__frame;
  if (!frame) return;
  IFRAMES.set(p.__id, frame);

  const start = () => {
    if (p.__started) return;
    let win;
    try { win = frame.contentWindow; } catch (e) { return false; }
    if (!win || typeof win.__boot !== 'function') return false;
    p.__started = true;
    try {
      // 所有面板共享同一份宿主状态对象：播放进度/曲库一改，全体立刻看到
      win.__RHINE_SHARED__ = SHARED;
      win.__RHINE_LIBRARY__ = LIB;
      win.__boot({
        id: p.__id, entry, manifest, scriptKey: p === rootPanel ? 'frame' : p.__id,
        w: Math.max(1, p.w || window.innerWidth), h: Math.max(1, p.h || window.innerHeight),
        globals: Object.assign({ DrawMode: 1 }, extra.globals || {}),
        region: extra.region || null,
      });
    } catch (e) {
      console.error(`[${p.__id}] boot 抛错`, e);
      log(`⚠️ ${p.__id} boot 抛错：${e.message}`);
    }
    return true;
  };

  // 面板内异常/就绪上报
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.__rhine !== 1 || m.id !== p.__id) return;
    if (m.type === 'ready') {
      p.__ready = true;
      log(ht('Panel ready: {0} ({1} callbacks, {2} ms)', p.__id, m.data.handlers.length, m.data.ms));
      if (p.w) p.Move(p.x, p.y, p.w, p.h);
      // 补发它错过的共享状态（可能还不止一次：脚本就绪与回调收集之间有时间差）
      BUS.catchUp(p.__id);
      setTimeout(() => BUS.catchUp(p.__id), 400);
      // ⚠️ 无曲库时，**每个面板就绪时**都补一次"空曲库已就绪"：主题的 LIB.live 只在收到 catalog
      //    时置真，而面板就绪需要好几秒（线上实测 stage 用了 7.3 s）——
      //    只靠启动时的定时器会早于 shim 出现，公告发不出去，档案页就一直停在"正在索引媒体库…"。
      if (noLibrary()) announceEmptyLibrary(p);
      // 面板重载会丢掉键盘监听，就绪时补挂（Alt+H 唤回状态条）
      try { p.__frame.contentWindow.document.addEventListener('keydown', onHudKey, true); } catch (e) { }
    }
    if (m.type === 'booted') {
      console.log(`[${p.__id}] 入口已执行`, m.data);
      if (!m.data.hasOnPaint) log(`⚠️ ${p.__id} 没有 on_paint（on_size=${m.data.hasOnSize}）`);
    }
    if (m.type === 'log') console.warn(`[${p.__id}] ${m.data.level}: ${m.data.message}`);
    if (m.type === 'error') { console.error(`[${p.__id}] ${m.data.phase}:`, m.data.message); log(`⚠️ ${p.__id} ${m.data.phase}: ${String(m.data.message).slice(0, 160)}`); }
  });

  // ⚠️⚠️ 不能只启动一次：主题切换界面语言用的是 window.Reload()（lib/i18n.js →
  //      lib/bus.js 的 "ui-lang"）——面板 iframe 会**自己重载**，load 事件再次触发。
  //      若这里因为 p.__started 直接 return，重载后的新页面就永远等不到 __boot
  //      （它要靠 __boot 拿到清单和脚本顺序才会加载主题脚本）→ 整块面板黑屏。
  //      用户实测："从中文切到英语，画面直接黑屏"。所以每次 load 都重新启动一次。
  frame.addEventListener('load', () => { p.__started = false; p.__ready = false; start(); });
  // 有些情况下 load 事件早于脚本就绪 / 或已被消费：轮询兜底
  let tries = 0;
  const poll = () => {
    if (p.__started || tries++ > 100) return;
    if (!start()) setTimeout(poll, 50);
  };
  setTimeout(poll, 30);
}

async function main() {
  applyHostLang();                     // HUD 按钮文案跟随主题的界面语言
  onKeyEverywhere(onHudKey);           // Alt+H 唤回左下角状态条（加载完会自动隐藏）
  startDemoPoll();                     // 空库空态时在「+ ADD MUSIC FOLDER」下方挂内置 demo 入口
  log('读取清单…');
  manifest = await (await fetch('/__manifest.json')).json();
  log(`清单：${Object.keys(manifest.text).length} 个文本 / ${Object.keys(manifest.images).length} 张图尺寸`);
  applyHostLang();   // 清单到手后再定一次语言：默认值就在清单内联的 audio-archive-settings.json 里
  await preloadFonts();

  // 1) 子面板（顺序必须与 frame.js 的 CHILDREN 一致）
  //    playlist 在原版里是 Columns UI 的原生 Playlist View（不是 JSplitter 面板），
  //    网页版用 native/playlist.js 以 DOM 复刻它，仍然是一个 iframe 面板（这样能复用主题的
  //    core.js：颜色/dp/字体，以及 shim 的 plman/fb 接口）
  CHILDREN.forEach((name, i) => {
    const p = makePanel(name, name, i);
    // 子面板一律在根面板之上（根面板只负责露出的缝隙）；fx 最后 → 在最上层
    const layer = String(i + 1);
    if (p.__frame) p.__frame.style.zIndex = layer;
    PANELS.push(p);
  });

  /* ------------------------------------------------- 手机适配（与电脑互斥） --
   * 背景：主题每个面板内部都是"按宽屏写死的排版"，窄屏会叠字、裁切；
   *       但 frame.js 的 regions() 完全按 **root 面板的 W/H** 计算。
   * 所以手机上的做法是：让 root 以 1440×820 的**虚拟尺寸**渲染（排版与桌面逐像素一致），
   *       再把 #stage 整体 scale 到屏幕里，并支持**双指缩放 / 平移**。
   *       主题代码一行都不用改，也不需要动 index.html 的样式。
   * 触发条件刻意收窄：**触摸设备 且 短边 < 700**（即手机）。平板与电脑完全不进这条路，
   *       因此电脑端的布局、坐标、画布分辨率都不会有任何变化。
   */
  const MOBILE = (() => {
    try {
      const coarse = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0;
      return !!coarse && Math.min(innerWidth, innerHeight) < 700;
    } catch (e) { return false; }
  })();
  const VIEW = MOBILE ? { w: 1440, h: 820 } : null;
  const VW = () => (VIEW ? VIEW.w : window.innerWidth);
  const VH = () => (VIEW ? VIEW.h : window.innerHeight);
  let mScale = 0, mTx = 0, mTy = 0;
  const fitScale = () => (VIEW ? Math.min(innerWidth / VIEW.w, innerHeight / VIEW.h) : 1);
  function applyMobileView() {
    if (!MOBILE) return;
    const st = $('#stage'); if (!st) return;
    st.style.transformOrigin = '0 0';
    st.style.width = VIEW.w + 'px';
    st.style.height = VIEW.h + 'px';
    st.style.transform = `translate(${mTx}px, ${mTy}px) scale(${mScale})`;
    // 宿主自绘、按主题坐标锚定的浮层（载入音频库按钮）要跟着这块板子重新定位，
    // 否则捏合/平移之后会偏到屏幕外。boot 早期 PANELS/函数还未就绪，用 try 兜住。
    try { updateDemoBtn(); } catch (e) { }
  }
  function clampPan() {
    if (!MOBILE) return;
    const w = VIEW.w * mScale, h = VIEW.h * mScale;
    mTx = w <= innerWidth ? (innerWidth - w) / 2 : Math.min(0, Math.max(innerWidth - w, mTx));
    mTy = h <= innerHeight ? (innerHeight - h) / 2 : Math.min(0, Math.max(innerHeight - h, mTy));
  }
  function layoutView() {
    if (!MOBILE) return;
    // 首次进入必须**用合适值**（mScale 初值 0 → 直接取 fit），之后换方向只保证"不小于合适值"，
    // 不重置用户已经捏合出来的缩放。
    mScale = mScale > 0 ? Math.max(mScale, fitScale()) : fitScale();
    clampPan(); applyMobileView();
  }
  if (MOBILE) {
    // 有效 DPR：让画布刚好匹配"板子缩放后的物理像素"（例 dpr3 × 0.48 ≈ 1.43 —— 比 dpr3 省约 4 倍像素）
    try { window.__RHINE_DPR__ = Math.min(2, Math.max(1, devicePixelRatio * fitScale())); } catch (e) { }
    const gdist = (p) => Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
    const gmid = (p) => [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2];
    let s0 = 1, d0 = 0, m0 = [0, 0], t0 = [0, 0];
    // 双指手势由各面板的 shim postMessage 上来（iframe 里的触摸不会冒泡到父页面）
    window.addEventListener('message', (e) => {
      const d = e.data; if (!d || !d.__rhineGesture) return;
      const pts = d.pts || [];
      if (d.__rhineGesture === 'start' && pts.length >= 2) {
        s0 = mScale; d0 = gdist(pts) || 1; m0 = gmid(pts); t0 = [mTx, mTy];
      } else if (d.__rhineGesture === 'move' && pts.length >= 2 && d0 > 0) {
        const st = $('#stage'); if (!st) return;
        const r = st.getBoundingClientRect();
        const ox = r.left - mTx, oy = r.top - mTy;      // 反推未变换的原点（rect 已含 transform）
        const bx = (m0[0] - ox - t0[0]) / s0, by = (m0[1] - oy - t0[1]) / s0;
        const m = gmid(pts);
        mScale = Math.max(fitScale() * 0.8, Math.min(4, s0 * (gdist(pts) / d0)));
        mTx = (m[0] - ox) - bx * mScale;
        mTy = (m[1] - oy) - by * mScale;
        clampPan(); applyMobileView();
      }
    });
    // 竖屏时给一句轻提示（不阻挡任何操作，4 秒后淡出）
    if (innerHeight > innerWidth) {
      const h = document.createElement('div');
      h.textContent = '横屏显示更完整 · 双指可缩放';
      h.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:99999;' +
        'background:rgba(10,10,12,.9);color:#d8cfc0;border:1px solid #2a2b28;border-radius:14px;' +
        'padding:4px 12px;font:12px ui-monospace,monospace;pointer-events:none;transition:opacity .6s';
      document.body.appendChild(h);
      setTimeout(() => { h.style.opacity = '0'; }, 4000);
      setTimeout(() => h.remove(), 5200);
    }
    layoutView();
  }

  // 2) 根面板（frame.js）：它才是布局的主人，放在最底层
  rootPanel = makePanel('root', 'settings', PANELS.length);
  rootPanel.__frame.style.zIndex = '0';
  rootPanel.Move(0, 0, VW(), VH());          // 手机 = 虚拟桌面尺寸（1440×820），电脑 = 真实视口
  rootPanel.Show(true);
  PANELS.push(rootPanel);

  // 父页面暴露给 shim 的面板表（GetPanelCount / GetPanelByIndex 用）
  window.__PANELS__ = PANELS;
  window.__RHINE_BUS__ = BUS;

  // 3) 恢复「启动即播开场影片」的原版行为
  //    说明：素材未移植时我曾写入 bootSelfTest=false 关掉它（那是**持久化**的，所以这里要显式清掉）。
  //    只迁移一次：之后用户在 菜单 › Audio Archive 里关掉开场动画的选择会被尊重。
  try {
    if (!localStorage.getItem('rhine:intro-default-restored')) {
      localStorage.removeItem('rhine:prop:root:bootSelfTest');
      const sf = 'rhine:file:audio-archive-settings.json';
      const raw = localStorage.getItem(sf);
      if (raw) {
        try {
          const o = JSON.parse(raw);
          if (o && o.bootSelfTest === false) { delete o.bootSelfTest; localStorage.setItem(sf, JSON.stringify(o)); }
        } catch (e) { }
      }
      localStorage.setItem('rhine:intro-default-restored', '1');
      console.log('[迁移] 已恢复开场动画默认开启（清除之前写入的 bootSelfTest=false）');
    }
  } catch (e) { }

  // 4) 逐面板启动
  const ENTRY = (n) => `themes/audio-archive/js/${n}.js`;
  for (const p of PANELS) {
    if (p.__native) continue;
    const entry = p === rootPanel ? ENTRY('frame') : ENTRY(p.__id);
    bootPanel(p, entry);
  }
  // 原生播放列表没有脚本，但要在父页面里注册好（frame.js 会 Move/Show 它）

  const relayout = () => {
    rootPanel.Move(0, 0, VW(), VH());
    const win = rootPanel.__frame.contentWindow;
    if (win && win.__rhine) win.__rhine.size(VW(), VH());
    layoutView();
  };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 120));

  // 拾取器按钮 + 快捷键（Ctrl+Alt+P）。Alt+点击在任何时候都能直接拾取，不必先开模式
  const pb = $('#pick-btn');
  if (pb) pb.addEventListener('click', () => setPicking(!picking));
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); setPicking(!picking); }
  });

  log('已启动 —— frame.js 正在计算布局');

  // 5) 曲库：?demo=1 走开发服务器的 HTTP 曲库（自测用）；否则让用户自己选目录
  if (new URLSearchParams(location.search).has('demo')) {
    setTimeout(() => loadHttpLibrary().catch((e) => log(ht('Loading the demo library failed: {0}', e.message))), 1200);
  } else {
    // ⚠️ 没有任何曲库时也必须"完成一次空索引"：主题的 LIB.live 只在收到 catalog 消息时才置真
    //    （lib/library.js:69），否则档案页永远停在 "INDEXING LIBRARY …"，
    //    连它自带的「+ ADD MUSIC FOLDER」入口（archive.js:762，条件是 LIB.live && !LIB.filter）
    //    都不会出现 —— 部署到公网后全新访客看到的就是一个永远转圈的页面（实测）。
    //    空索引之后主题会显示 "NO ALBUMS · …" + 添加音乐文件夹按钮，点它就走 Library/Configure
    //    → shim 映射到宿主的 add-music → 目录选择器，链路是通的。
    //    ⚠️ 面板就绪要好几秒（线上实测 stage 7.3 s），单靠一个定时器会早于 shim 出现而白发 ——
    //       所以：先置曲库就绪放行 worker，再按多个时间点补发，最后靠 ready 事件兜底（见 ready 分支）。
    setTimeout(() => libraryLoaded(0), 1200);
    for (const t of [1500, 3000, 6000, 10000]) {
      setTimeout(() => { if (noLibrary()) announceEmptyLibrary(); }, t);
    }
  }
}

/** 是否"完全没有曲库"（全新访客 / 还没选目录） */
const noLibrary = () => !LIB.files.length && !location.search.includes('demo=1');

/**
 * 把"媒体库已就绪（0 曲目）"告诉主题。
 * 为什么必须做：主题的 LIB.live 只在收到 catalog 消息时置真（lib/library.js:69），空曲库时这条
 * 路径不会自己发生 —— 于是档案页永远停在 "INDEXING LIBRARY …"，连主题自带的
 * 「+ ADD MUSIC FOLDER」入口（archive.js:762，条件是 LIB.live && !LIB.filter）都不出现。
 * 部署到公网后，全新访客看到的就是一个永远转圈的页面。
 * 传 panel 就只发给那一个面板（面板就绪时逐个补发）。
 */
function announceEmptyLibrary(panel) {
  let any = false;
  for (const p of (panel ? [panel] : PANELS)) {
    const w = p.__frame && p.__frame.contentWindow;
    try { if (w && w.__rhine && w.__rhine.emptyCatalog && w.__rhine.emptyCatalog()) any = true; } catch (e) { }
  }
  return any;
}

// shim 里 HOST.command（fb.RunMainMenuCommand / 主题菜单动作）的落地实现
/* ============================================================ 媒体库与播放 == */
/**
 * 网页版的"媒体库"有两个提供器：
 *   fs    —— File System Access API（真实用法：点「+ ADD MUSIC FOLDER」选目录）
 *   http  —— 开发/自测用（?demo=1）：从开发服务器 /__music.json 读 .dev/music 下的素材，
 *            因为无头浏览器点不了原生目录对话框
 * 两者都产出同一种 files 数组：[{ path, url } | { path, file }]
 * path 必须是 **Windows 反斜杠**形式 —— 主题的 albumKeyOf()/albumDir() 按 "\\" 切分组专辑，
 * 用正斜杠会把同一张专辑拆成多个 key、货架上就散了。
 */
const LIB = { files: [], source: null, tracks: [], playlists: [], activePlaylist: -1, focus: -1, focusPlaylist: -1, playing: { playlist: -1, item: -1 }, albums: [], ready: false,
  // 原生播放列表的选择集（Columns UI 的 Playlist View 有整行多选）
  // ⚠️ 语义（与 plman 对齐）：focus / selection.items / playing.item 都是**播放列表项下标**，
  //    不是曲库曲目下标 —— 早期两者恰好相同（演示库的播放列表就是 0..N-1）而掩盖了这个区别。
  //    曲目下标放在 focusTrack，fb.GetFocusItem 用它。
  selection: { playlist: -1, items: [] }, focusTrack: -1 };
/** 播放列表项下标 → 曲库曲目下标 */
function trackOf(pl, i) {
  const p = LIB.playlists[pl];
  return p && p.items ? (p.items[i] ?? -1) : -1;
}

const SHARED = { transport: { playing: false, paused: false, time: 0, length: 0, volume: -10 } };
const audio = new Audio();
audio.preload = 'metadata';

/* ---------------------------------------------------------------- 实时可视化 -- */
// 主题的 signal 视图每帧调 fb.GetAudioChunkTo()（见主题 lib/audio.js:24），期望拿到**交错声道**的
// Float32 PCM；它自己再做 2048 点 FFT、48 个对数频段、峰值/RMS/立体声相关性。
// 网页版：<audio> → MediaElementSource → ChannelSplitter → 两个 AnalyserNode（真正的左右声道，
// 所以 STEREO CORR 是真的而不是恒定 1）。全部同步，面板在渲染帧里直接读。
const PCM = { ac: null, split: null, L: null, R: null, bufL: null, bufR: null, failed: false };
function ensureAudioGraph() {
  if (PCM.ac || PCM.failed) return PCM.ac;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { PCM.failed = true; return null; }
    const ac = new AC();
    const src = ac.createMediaElementSource(audio);
    const split = ac.createChannelSplitter(2);
    const L = ac.createAnalyser(), R = ac.createAnalyser();
    L.fftSize = R.fftSize = 2048;                     // 主题一次要 2048 个样本
    src.connect(split);
    split.connect(L, 0);
    split.connect(R, 1);
    // ⚠️ createMediaElementSource 会把音频"接管"进音频图：必须接回 destination，
    //    否则声音只进分析器、扬声器静音；上下文被挂起时同样会静音，所以下面每次都尝试 resume
    src.connect(ac.destination);
    Object.assign(PCM, { ac, split, L, R, bufL: new Float32Array(L.fftSize), bufR: new Float32Array(R.fftSize) });
    log(`音频可视化就绪：${ac.sampleRate} Hz / 2 声道`);
  } catch (e) {
    PCM.failed = true;
    log('音频可视化初始化失败：' + e.message);
    return null;
  }
  return PCM.ac;
}
// 浏览器要求音频上下文在**用户手势之后**才能运行。如果等到 signal 视图第一次取 PCM 时才建图，
// 而那一刻上下文又处于挂起状态，声音会被音频图"接管但不输出" → 静音。所以在第一次点击/按键时
// 就把它建好并 resume（此时手势一定存在），播放时它就是 running 的。
window.addEventListener('pointerdown', () => { const ac = ensureAudioGraph(); if (ac && ac.state === 'suspended') ac.resume().catch(() => { }); }, { once: true });
window.addEventListener('keydown', () => { const ac = ensureAudioGraph(); if (ac && ac.state === 'suspended') ac.resume().catch(() => { }); }, { once: true });
/** shim 的 fb.GetAudioChunkTo 同步转发到这里：写入交错样本，返回浮点数个数 */window.__RHINE_AUDIO_PCM__ = (chunk, seconds, info) => {
  const ac = ensureAudioGraph();
  if (!ac || !chunk) return 0;
  if (ac.state === 'suspended') ac.resume().catch(() => { });
  if (ac.state !== 'running' || audio.paused) return 0;   // 没在播放就返回 0（主题会让频段自然衰减）
  const n = Math.min(PCM.bufL.length, Math.max(1, Math.round((seconds || 0.046) * ac.sampleRate)));
  PCM.L.getFloatTimeDomainData(PCM.bufL);
  PCM.R.getFloatTimeDomainData(PCM.bufR);
  const start = PCM.bufL.length - n;                      // 取最近 n 个样本
  let w = 0;
  for (let i = 0; i < n; i++) { chunk[w++] = PCM.bufL[start + i] || 0; chunk[w++] = PCM.bufR[start + i] || 0; }
  if (info) { info.SampleRate = ac.sampleRate; info.ChannelCount = 2; info.SampleCount = n; }
  return w;
};

/** 把宿主状态推给所有面板（同一个对象，播放进度自动同步） */
function pushShared() {
  for (const p of PANELS) {
    const w = p.__frame && p.__frame.contentWindow;
    if (!w) continue;
    w.__RHINE_SHARED__ = SHARED;
    w.__RHINE_LIBRARY__ = LIB;
  }
}

/* ------------------------------------------------------- 布局元素拾取器 --
 * 这个 UI 没有可选的 DOM 元素（每个面板只有一个 canvas，按钮都是画上去的），
 * 所以 DevTools 的选取箭头选不到里面的按钮。拾取器补上这一步：
 *   按住 Alt 点击画面，或点 HUD 上的「拾取元素」按钮后直接点击，
 * 就会在 HUD 和控制台打印一行"面板 / 面板内坐标 / 主题命中区 id / 该像素颜色"，
 * 同时写进剪贴板 —— 把那一行发给我，我就知道你说的是哪块布局了。
 */
let picking = false;
const PICK_LOG = [];      // 最近 20 条拾取记录（控制台里 PICK_LOG 可查）
window.PICK_LOG = PICK_LOG;
window.__RHINE_PICK__ = (info) => {
  const p = PANELS.find((x) => x.__id === info.panel || x.id === info.panel);
  const w = p && p.__frame && p.__frame.contentWindow;
  let hit = '（画布像素，无命名命中区）', view = '?', extra = '', size = '?', frac = '', near = '';
  if (w) {
    try { view = w.eval('typeof STATE !== "undefined" ? STATE.view : "?"'); } catch (e) { }
    try {
      size = w.eval('typeof W !== "undefined" ? W + "x" + H : "?"');
      const [pw, ph] = String(size).split('x').map(Number);
      if (pw && ph) frac = `相对位置=${(info.x / pw * 100).toFixed(1)}%,${(info.y / ph * 100).toFixed(1)}%`;
    } catch (e) { }
    try {
      hit = w.eval(`(function(){ try { const a = hits.at(${info.x}, ${info.y}); return a ? (a.id + (a.data !== undefined ? " data=" + JSON.stringify(a.data) : "")) : "（画布像素，无命名命中区）"; } catch(e) { return "（此面板没有 hits）"; } })()`);
    } catch (e) { hit = '（读取失败）'; }
    // 拾取点附近有哪些命名命中区（±70px）—— 纯文字/图标也能对应到所属按钮
    try {
      const raw = w.eval(`(function(){
        try {
          const seen = new Map();
          for (let dy = -70; dy <= 70; dy += 6) for (let dx = -70; dx <= 70; dx += 6) {
            const a = hits.at(${info.x} + dx, ${info.y} + dy);
            if (!a) continue;
            const k = a.id + "|" + JSON.stringify(a.data);
            const d = Math.max(Math.abs(dx), Math.abs(dy));
            const r = (a.x + Math.round(a.w / 2)) + "," + (a.y + Math.round(a.h / 2));
            if (!seen.has(k) || seen.get(k).d > d) seen.set(k, { d, r });
          }
          return JSON.stringify([...seen.entries()].map(([k, v]) => k.replace("|", " data=") + " 中心≈" + v.r + " 距" + v.d + "px").slice(0, 3));
        } catch (e) { return "[]"; }
      })()`);
      const arr = JSON.parse(raw || '[]');
      if (arr.length) near = ' 附近: ' + arr.join(' / ');
    } catch (e) { }
    // 拾取点是不是某个专辑外壳？
    try {
      extra = w.eval(`(function(){ try { if (typeof AR === "undefined" || !AR.hits) return ""; for (const h of AR.hits) { const q = h.quad; let inside = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const [xi, yi] = q[i], [xj, yj] = q[j]; if ((yi > ${info.y}) !== (yj > ${info.y}) && ${info.x} < (xj - xi) * (${info.y} - yi) / (yj - yi) + xi) inside = !inside; } if (inside) return "  ← 专辑外壳 #" + h.i; } return ""; } catch(e) { return ""; } })()`);
    } catch (e) { }
  }
  const line = `【拾取】面板=${info.panel}(${size}) 视图=${view} ${frac} 坐标=${info.x},${info.y} 命中=${hit} 像素=${info.px}`
    + ` | 画布=${info.canvas || '?'} css=${info.css || '?'} dpr=${info.dpr || '?'} 面板CSS=${info.frame || '?'} 主题WH=${info.logW || '?'}`
    + `${near}${extra}`;
  window.__RHINE_LAST_PICK__ = line;      // 供测试读取（HUD 里的行会被后续日志顶掉）
  PICK_LOG.push(line); if (PICK_LOG.length > 20) PICK_LOG.shift();
  log(line);
  console.log(line);
  try { navigator.clipboard.writeText(line); } catch (e) { }
};

function setPicking(on) {
  picking = on;
  for (const p of PANELS) {
    const w = p.__frame && p.__frame.contentWindow;
    try { if (w && w.__rhineSetPicking) w.__rhineSetPicking(on); } catch (e) { }
  }
  const b = $('#pick-btn');
  if (b) b.classList.toggle('on', on);
  log(on ? ht('Pick mode on: click anywhere (or hold Alt and click); the result is printed and copied to the clipboard') : ht('Pick mode off'));
}

/** 调试句柄：给 .dev/ 下的探针用（也方便你在控制台里手动试） */
window.__RHINE_DEBUG__ = { LIB, SHARED, audio, playIndex, nextTrack, loadHttpLibrary, loadFsLibrary, emit, pushShared };

/** 曲库就绪：让主题重新索引（等价于 foobar2000 的"媒体库加载完成"） */
function libraryLoaded(fileCount) {
  LIB.ready = true;
  pushShared();
  log(ht('Music library ready: {0} files (source {1}) → asking the panels to re-index', fileCount, LIB.source));
  for (const p of PANELS) {
    const w = p.__frame && p.__frame.contentWindow;
    if (!w || !w.__rhine) continue;
    // 放行排队中的索引请求；已经放行过的面板就不必再触发"媒体库加曲目"了（否则曲库会被解析两遍）
    const flushed = w.__rhine.libraryReady();
    if (!flushed) w.__rhine.call('on_library_items_added');
  }
}

/** worker 解析完曲库后回调（由 shim 的 Worker 桥转发） */
window.__RHINE_ON_CATALOG__ = (m) => {
  LIB.tracks = (m.items || []).map((t) => ({
    title: t.title, artist: t.artist, album: t.albumTitle, albumArtist: t.artist,
    genre: t.genre, year: t.year, codec: t.codec, bits: t.bits, rate: t.rate, kbps: t.kbps,
    lossless: t.lossless, length: t.length, disc: 1, track: (t.ord || 0) % 1000, plays: t.plays || 0,
    path: t.__src ? t.__src.path : '', url: t.__src ? t.__src.url : null, file: t.__src ? t.__src.file : null,
    size: t.__src ? t.__src.size || 0 : 0, albumKey: t.album,
  }));
  LIB.playlists = [{ name: 'Default Playlist', items: LIB.tracks.map((_, i) => i) }];
  LIB.activePlaylist = 0; LIB.focus = -1; LIB.focusPlaylist = -1;
  LIB.playing = { playlist: -1, item: -1 };
  LIB.albums = m.albums || [];
  pushShared();
  log(ht('Library indexed: {0} tracks / {1} albums ({2} ms)', m.tracks, LIB.albums.length, Math.round(m.ms.index)));
  // ⚠️ 这里**绝对不能**触发 on_library_items_changed / on_library_items_added：
  //    主题的 lib/library.js 把这两个回调接到 libChanged() → 1.5 秒后重新发 index 请求，
  //    于是变成 "catalog → 通知 → 重新索引 → catalog …" 的无限循环
  //    （实测控制台刷到 gen=24 还在涨，档案视图也跟着一直重排、闪烁）。
  //    只广播"播放列表变了"（主题在 source === "library" 时对它是 no-op）+ 重绘即可。
  for (const p of PANELS) {
    const w = p.__frame && p.__frame.contentWindow;
    if (w && w.__rhine) { w.__rhine.call('on_playlists_changed'); w.__rhine.repaint(); }
  }
};

async function loadHttpLibrary() {
  const list = await (await fetch('/__music.json')).json();
  LIB.files = list; LIB.source = 'http';
  log(ht('HTTP library: {0} files', list.length));
  if (list.length) libraryLoaded(list.length); else log('（/.dev/music 里没有音频素材）');
}

async function loadFsLibrary() {
  if (!window.showDirectoryPicker) { log(ht('This browser has no File System Access API — use Chrome or Edge')); return; }
  let dir;
  try { dir = await window.showDirectoryPicker({ id: 'rhine-music', mode: 'read' }); }
  catch (e) { log(ht('Choosing a folder was cancelled')); return; }
  const rootName = dir.name || 'Music';
  const files = [];
  // ⚠️⚠️ 必须把**同名的文本文件**也读进来（.lrc 歌词 / .srt 字幕 / .txt 等）。
  //    File System Access 拿不到真实绝对路径（浏览器不给），只能把路径拼成 `D:\<目录名>\…`，
  //    而清单的键是仓库相对路径 —— 于是"选了 D:\…\musiclab，Mili 那首的 .lrc 就在同目录同文件名，
  //    主题却问不到"。实测用户报的正是这个：手动选目录 → 歌词不加载；
  //    而本地 ?demo=1 走开发服务器（传真实绝对路径）→ 歌词正常，看起来"很奇怪"。
  //    这里把文本读进内存，经 window.__RHINE_FS__ 交给 shim 的同步 IsFile/ReadTextFile 查。
  const TEXT_SIDECAR = /\.(lrc|srt|txt|md)$/i;
  const fsText = new Map(), fsFiles = new Set();
  const walk = async (handle, prefix) => {
    for await (const [name, ent] of handle.entries()) {
      const p = prefix + '\\' + name;
      if (ent.kind === 'directory') { await walk(ent, p); continue; }
      const abs = 'D:\\' + rootName + p;
      fsFiles.add(abs);
      if (/\.(mp3|flac|m4a|ogg|oga|opus|wav|aac)$/i.test(name)) files.push({ path: abs, file: await ent.getFile() });
      else if (TEXT_SIDECAR.test(name)) { try { fsText.set(abs, await (await ent.getFile()).text()); } catch (e) { } }
    }
  };
  log(ht('Scanning the folder…'));
  await walk(dir, '');
  LIB.files = files; LIB.source = 'fs';
  window.__RHINE_FS__ = { text: fsText, files: fsFiles, root: 'D:\\' + rootName };
  log(ht('Scan finished: {0} audio files, {1} text sidecars', files.length, fsText.size));
  if (files.length) libraryLoaded(files.length);
}

/* ------------------------------------------------------------------- 播放 -- */
function trackSrc(i) {
  const t = LIB.tracks[i];
  if (!t) return null;
  if (t.url) return t.url;
  if (t.file) { if (!t.__objUrl) t.__objUrl = URL.createObjectURL(t.file); return t.__objUrl; }
  return null;
}

function emit(evt, arg) {
  for (const p of PANELS) {
    const w = p.__frame && p.__frame.contentWindow;
    if (w && w.__rhine) w.__rhine.transport(evt, arg);
  }
}

function playIndex(i) {
  const src = trackSrc(i);
  if (!src) { log(ht('Track {0} has no playable source', i + 1)); return; }
  const pl = LIB.activePlaylist >= 0 ? LIB.activePlaylist : 0;
  const at = ((LIB.playlists[pl] || {}).items || []).indexOf(i);   // 曲目下标 → 播放列表项下标
  const fresh = LIB.playing.item !== (at >= 0 ? at : i);           // 比"列表项下标"，与 playing.item 同尺度
  LIB.playing = { playlist: pl, item: at >= 0 ? at : i };
  LIB.focusPlaylist = pl; LIB.focus = LIB.playing.item; LIB.focusTrack = i;
  LIB.selection = { playlist: pl, items: [LIB.playing.item] };     // 列表跟着播放走（与双击那一行一致）
  audio.src = src;
  audio.volume = Math.pow(10, (SHARED.transport.volume || -10) / 20);
  audio.play().then(() => {
    SHARED.transport.playing = true; SHARED.transport.paused = false;
    pushShared();
    emit(fresh ? 'on_playback_new_track' : 'on_playback_starting');
    emit('on_playlist_items_selection_change');
    log(ht('Playing: {0}', LIB.tracks[i].title || LIB.tracks[i].path));
  }).catch((e) => log(ht('Playback failed: {0} (the browser may not support this format)', e.message)));
}

function nextTrack(d) {
  const pl = LIB.playlists[LIB.activePlaylist >= 0 ? LIB.activePlaylist : 0];
  if (!pl || !pl.items.length) return;
  let at = pl.items.indexOf(LIB.playing.item);
  at = at < 0 ? (d > 0 ? 0 : pl.items.length - 1) : (at + d + pl.items.length) % pl.items.length;
  playIndex(pl.items[at]);
}

audio.addEventListener('loadedmetadata', () => { SHARED.transport.length = audio.duration || 0; pushShared(); emit('on_playback_new_track'); });
audio.addEventListener('play', () => { SHARED.transport.playing = true; SHARED.transport.paused = false; pushShared(); emit('on_playback_starting'); });
audio.addEventListener('pause', () => { SHARED.transport.playing = false; SHARED.transport.paused = true; pushShared(); emit('on_playback_pause', true); });
audio.addEventListener('ended', () => { SHARED.transport.playing = false; pushShared(); emit('on_playback_stop', 0); nextTrack(1); });
audio.addEventListener('timeupdate', () => { SHARED.transport.time = audio.currentTime; pushShared(); });
// ⚠️⚠️ 流畅播放（对齐原版手感）：原版由 foobar2000 **每秒**回调一次 on_playback_time，
//   但主题自己有一套动画时钟（lib/motion.js 的 Clock 每 8ms 一帧，播放时持续跑），
//   每一帧都会重绘并重新读 fb.PlaybackTime，所以播放条看起来是连续跑的。
//   网页版之前只在 1 秒的 setInterval 里 emit 一次，而且 SHARED.transport.time 只在
//   <audio> 的 timeupdate（约 4Hz）里更新 —— 于是播放条与 SIGNAL 轨迹的进度都是"1 秒一跳"。
//   现在按帧写时间（所有面板读 fb.PlaybackTime 都拿到当前值）并按帧通知 transport 重画游标；
//   on_playback_time 在主题里只有 transport.js 一个订阅者（repaintRuler，很轻），所以每帧发是安全的。
let playRAF = 0;
function playbackTick() {
  if (!audio.paused) {
    SHARED.transport.time = audio.currentTime || 0;
    emit('on_playback_time', Math.floor(SHARED.transport.time));
  }
  playRAF = requestAnimationFrame(playbackTick);
}
playRAF = requestAnimationFrame(playbackTick);

let currentMode = 'dark';
let currentScheme = 'archive';

/** 把"配色集"（scheme + mode）应用给所有面板 —— 等价于原版导入 .fcl 后主题重读 Columns UI 颜色 */
function applyLook(patch) {
  if (patch.scheme) currentScheme = patch.scheme;
  if (patch.mode === 'light' || patch.mode === 'dark') currentMode = patch.mode;
  for (const p of PANELS) {
    const w = p.__frame && p.__frame.contentWindow;
    try { if (w && w.__rhine && w.__rhine.setLook) w.__rhine.setLook({ scheme: currentScheme, mode: currentMode }); } catch (e) { }
  }
}

window.__RHINE_CMD__ = (cmd) => {
  cmd = String(cmd || '');
  if (cmd.startsWith('mode:')) {
    const what = cmd.slice(5);
    let mode;
    if (/light/i.test(what)) mode = 'light';
    else if (/dark/i.test(what)) mode = 'dark';
    else if (/system/i.test(what)) mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    else mode = currentMode === 'dark' ? 'light' : 'dark';          // "Switch to other mode"
    applyLook({ mode });
    log(ht('Mode switched → {0}', mode));
    return;
  }
  // 配色方案 / 预设导入（原版：restart foobar2000 with /columnsui:import-quiet <fcl>）
  if (cmd.startsWith('import:')) {
    let req = {};
    try { req = JSON.parse(cmd.slice(7)); } catch (e) { }
    applyLook({ scheme: req.scheme, mode: req.mode });
    log(ht('Colour scheme → {0} ({1})', req.scheme, req.mode));
    return;
  }
  if (cmd === 'add-music') { loadFsLibrary(); return; }
  if (cmd === 'preferences') { prefToggle(); return true; }
  // 播放与播放列表（主题的 fb.PlayOrPause / plman.ActivePlaylist = … 都落到这里）
  if (cmd === 'toggle') { if (audio.paused) { if (LIB.playing.item < 0 && LIB.tracks.length) playIndex(0); else audio.play().catch(() => { }); } else audio.pause(); return; }
  if (cmd === 'play') { audio.play().catch(() => { }); return; }
  if (cmd === 'pause') { audio.pause(); return; }
  if (cmd === 'stop') { audio.pause(); audio.currentTime = 0; SHARED.transport.playing = false; SHARED.transport.paused = false; SHARED.transport.time = 0; pushShared(); emit('on_playback_stop', 1); return; }
  if (cmd === 'next') { nextTrack(1); return; }
  if (cmd === 'prev' || cmd === 'previous') { nextTrack(-1); return; }
  if (cmd.startsWith('volume:')) {
    const v = Number(cmd.slice(7));
    SHARED.transport.volume = v;
    audio.volume = Math.min(1, Math.max(0, Math.pow(10, v / 20)));
    pushShared(); emit('on_volume_change', v); return;
  }
  if (cmd === 'vol-up') { window.__RHINE_CMD__(`volume:${Math.min(0, (SHARED.transport.volume || -10) + 1)}`); return; }
  if (cmd === 'vol-down') { window.__RHINE_CMD__(`volume:${Math.max(-100, (SHARED.transport.volume || -10) - 1)}`); return; }
  // 跳转：主题的进度条/歌词行/信号轨迹/方向键都落到这里（fb.PlaybackTime = …）
  if (cmd.startsWith('seek:')) {
    const t = Number(cmd.slice(5));
    const len = (audio.duration || SHARED.transport.length || 0);
    if (Number.isFinite(t) && len > 0) {
      audio.currentTime = Math.max(0, Math.min(t, Math.max(0, len - 0.05)));
      SHARED.transport.time = audio.currentTime;
      pushShared();
      emit('on_playback_seek');           // 歌词/信号视图据此重新对齐（stage.js:86）
    }
    return;
  }
  if (cmd.startsWith('play:')) { const [, p, i] = cmd.split(':'); LIB.activePlaylist = Number(p); LIB.playlists[Number(p)] = LIB.playlists[Number(p)] || { name: 'Playlist', items: [] }; playIndex((LIB.playlists[Number(p)].items || [])[Number(i)] ?? Number(i)); return; }
  if (cmd.startsWith('focus:')) {
    const [, p, i] = cmd.split(':');
    const pl = Number(p), at = Number(i);
    LIB.focusPlaylist = pl; LIB.focus = at; LIB.focusTrack = trackOf(pl, at);
    pushShared(); emit('on_item_focus_change');
    return;
  }
  // 追加/取消单项选择（Columns UI 的 SetPlaylistSelectionSingle 语义：不清空已有选择）
  if (cmd.startsWith('pl-seladd:')) {
    const rest = cmd.slice(10), [plS, iS, onS] = rest.split(':');
    const pl = Number(plS), at = Number(iS);
    if (!LIB.selection || LIB.selection.playlist !== pl) LIB.selection = { playlist: pl, items: [] };
    const set = new Set(LIB.selection.items);
    if (onS === '0') set.delete(at); else set.add(at);
    LIB.selection.items = [...set].sort((a, b) => a - b);
    pushShared(); emit('on_playlist_items_selection_change');
    return;
  }
  // 原生播放列表（native/playlist.js）的选择集：pl-select:<pl>:<下标,下标…>（空 = 清空选择）
  if (cmd.startsWith('pl-select:')) {
    const rest = cmd.slice(10), sep = rest.indexOf(':');
    const pl = Number(rest.slice(0, sep)), list = rest.slice(sep + 1);
    const items = list ? String(list).split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0) : [];
    LIB.selection = { playlist: pl, items };
    pushShared(); emit('on_playlist_items_selection_change');
    return;
  }
  // 移除当前选择集（原生列表的右键菜单 → plman.RemovePlaylistSelection）
  if (cmd.startsWith('pl-remove:')) {
    const pl = Number(cmd.slice(10));
    const p = LIB.playlists[pl];
    if (p && LIB.selection.playlist === pl && LIB.selection.items.length) {
      const gone = LIB.selection.items.slice().sort((a, b) => b - a);
      for (const at of gone) p.items.splice(at, 1);
      LIB.selection = { playlist: pl, items: [] };
      if (LIB.focusPlaylist === pl) { LIB.focus = Math.min(LIB.focus, p.items.length - 1); LIB.focusTrack = trackOf(pl, LIB.focus); }
      pushShared(); emit('on_playlist_items_removed', pl); emit('on_playlist_items_selection_change');
      log(ht('Removed {0} playlist items', gone.length));
    }
    return;
  }
  // 点列标题排序：shim 里逐项求值排序格式后把新顺序发过来
  if (cmd.startsWith('pl-reorder:')) {
    const rest = cmd.slice(11), sep = rest.indexOf(':');
    const pl = Number(rest.slice(0, sep)), order = rest.slice(sep + 1).split(',').map(Number).filter(Number.isFinite);
    const p = LIB.playlists[pl];
    if (p && order.length === p.items.length) {
      p.items = order;
      LIB.selection = { playlist: pl, items: [] };
      pushShared(); emit('on_playlist_items_reordered', pl); emit('on_playlist_items_selection_change');
    }
    return;
  }
  // 播放列表改名（head 双击名字 → plman.RenamePlaylist）
  if (cmd.startsWith('pl-rename:')) {
    const rest = cmd.slice(10), sep = rest.indexOf(':');
    const pl = Number(rest.slice(0, sep)), name = rest.slice(sep + 1).trim();
    if (LIB.playlists[pl] && name) {
      LIB.playlists[pl].name = name;
      pushShared(); emit('on_playlists_changed');
      log(ht('Playlist renamed → {0}', name));
    }
    return;
  }
  if (cmd.startsWith('pl-ensure:')) {
    const [, p, i] = cmd.split(':');
    const pw = (BY_ID.get('playlist') || {}).__frame;
    const win = pw && pw.contentWindow;
    if (win && win.__rhine) win.__rhine.call('ensure-visible', Number(p), Number(i));
    return;
  }
  if (cmd.startsWith('active-playlist:')) {
    LIB.activePlaylist = Number(cmd.slice(16));
    pushShared(); emit('on_playlist_switch'); emit('on_playlists_changed');
    for (const p of PANELS) { const w = p.__frame && p.__frame.contentWindow; if (w && w.__rhine) w.__rhine.repaint(); }
    return;
  }
  // 播放列表编辑（主题 playAlbum() 的链路：CreatePlaylist → ClearPlaylist → InsertPlaylistItems，
  // 全部同步执行并返回结果，shim 的 plman.* 依赖这些返回值）
  if (cmd.startsWith('create-playlist:')) {
    // create-playlist:<at>:<name>
    const rest = cmd.slice(17), sep = rest.indexOf(':');
    const at = Number(rest.slice(0, sep)), name = rest.slice(sep + 1) || 'Playlist';
    const pos = Number.isFinite(at) && at >= 0 && at <= LIB.playlists.length ? at : LIB.playlists.length;
    LIB.playlists.splice(pos, 0, { name, items: [] });
    pushShared(); emit('on_playlists_changed');
    return pos;   // 新播放列表的下标（CreatePlaylist 的返回值）
  }
  if (cmd.startsWith('clear-playlist:')) {
    const p = Number(cmd.slice(15));
    if (LIB.playlists[p]) LIB.playlists[p].items = [];
    pushShared(); emit('on_playlist_items_changed'); emit('on_playlists_changed');
    return true;
  }
  if (cmd.startsWith('insert-playlist:')) {
    // insert-playlist:<p>:<at>:<逗号分隔的曲目索引>
    const [, p, at, ids] = cmd.split(':');
    const pl = LIB.playlists[Number(p)] = LIB.playlists[Number(p)] || { name: 'Playlist', items: [] };
    const add = String(ids || '').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n < LIB.tracks.length);
    pl.items.splice(Number(at) || 0, 0, ...add);
    pushShared(); emit('on_playlist_items_changed'); emit('on_playlists_changed');
    return true;
  }
  // 自动播放列表（主题的搜索：shim 按查询语句算好曲目索引后发过来）
  if (cmd.startsWith('auto-playlist:')) {
    // auto-playlist:<at>:<encodeURIComponent(name)>:<逗号分隔的曲目索引>
    const rest = cmd.slice(14), s1 = rest.indexOf(':'), s2 = rest.indexOf(':', s1 + 1);
    const at = Number(rest.slice(0, s1));
    let name = 'Search';
    try { name = decodeURIComponent(rest.slice(s1 + 1, s2)) || name; } catch (e) { }
    // ⚠️ 必须 filter(Boolean)：搜不到东西时曲目段是空串，''.split(',') = ['']，
    //    Number('') = 0 → 会把第 0 首当成结果插进去（实测：搜不存在的词反而显示 bombinsound）
    const items = rest.slice(s2 + 1).split(',').filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n < LIB.tracks.length);
    const pos = Number.isFinite(at) && at >= 0 && at <= LIB.playlists.length ? at : LIB.playlists.length;
    LIB.playlists.splice(pos, 0, { name, items, auto: true });   // auto: plman.IsAutoPlaylist 用
    pushShared(); emit('on_playlists_changed');
    log(ht('Auto playlist “{0}”: {1} tracks', name, items.length));
    return pos;
  }
  if (cmd.startsWith('delete-playlist:')) {
    const i = Number(cmd.slice(16));
    if (!LIB.playlists[i]) return false;
    LIB.playlists.splice(i, 1);
    // 下标修正：活动列表 / 正在播放的列表 / 焦点列表都在被删项之后时要往前挪
    if (LIB.activePlaylist > i) LIB.activePlaylist--;
    if (LIB.playing && LIB.playing.playlist > i) LIB.playing.playlist--;
    if (LIB.focusPlaylist > i) LIB.focusPlaylist--;
    pushShared(); emit('on_playlists_changed');
    log(ht('Playlist deleted (was index {0})', i));
    return true;
  }
  console.log('宿主命令（暂未实现）:', cmd);
};

/* ---------------------------------------------------------------- 网页版首选项 --
 * 原版右上角的 PREFERENCES 调 fb.ShowPreferences() —— foobar2000 的**原生**设置对话框
 * （Media Library 文件夹、Display › Columns UI › Colours and fonts、Playback / Output / DSP…）。
 * 浏览器里没有 foobar2000，所以这里做一个"网页版对应物"：只放**端口特有、主题 MENU 里
 * 放不下**的东西 —— 曲库来源、缓存、重置、快捷键、关于；主题自己的设置仍然在 MENU 里。
 */
let prefEl = null;
const PREF = {
  bg: '#1b1c18', fg: '#f2f1ec', soft: 'rgba(242,241,236,.62)', hair: 'rgba(242,241,236,.20)',
  accent: '#ff7a1a', font: '"Geist Mono","Microsoft YaHei UI",monospace',
};
const prefClose = () => { if (prefEl) { prefEl.remove(); prefEl = null; } };
const prefToggle = () => (prefEl ? prefClose() : prefOpen());

function prefStats() {
  const tracks = LIB.tracks || [];
  const albums = new Set(tracks.map((t) => (t.album || '') + '|' + String(t.path || '').replace(/[^\\/]*$/, ''))).size;
  const size = tracks.reduce((n, t) => n + (t.size || 0), 0);
  const dur = tracks.reduce((n, t) => n + (t.length || 0), 0);
  const hh = Math.floor(dur / 3600), mm = Math.floor((dur % 3600) / 60), ss = Math.round(dur % 60);
  return {
    files: tracks.length, albums,
    size: size ? (size / 1048576).toFixed(1) + ' MB' : '—',
    dur: dur ? (hh ? hh + ':' : '') + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0') : '—',
    source: location.search.includes('demo=1') ? ht('Demo library (?demo=1)')
      : (LIB.files && LIB.files.length ? ht('Local folder (File System Access)') : ht('Not loaded')),
  };
}

function prefOpen() {
  const s = prefStats();
  const wrap = document.createElement('div');
  wrap.id = 'rhine-prefs';
  // color-scheme: dark 让浏览器把**原生**滚动条也画成深色（否则是白底灰块，在这套界面里很突兀）；
  // 下面再用 ::-webkit-scrollbar 把它收到的主题色，两者一起才彻底。
  wrap.style.cssText = `position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;font:13px/1.7 ${PREF.font};color:${PREF.fg};color-scheme:dark`;
  const box = document.createElement('div');
  box.style.cssText = `width:660px;max-width:92vw;max-height:88vh;overflow:auto;background:${PREF.bg};border:1px solid ${PREF.hair};box-shadow:0 26px 90px rgba(0,0,0,.72);scrollbar-gutter:stable`;
  wrap.appendChild(box);
  // ⚠️ 这个对话框画在**顶层文档**里，拿不到主题面板（iframe）里的样式表，所以滚动条要在这里单独写。
  //    用户实测："内容多时右侧滑标白底灰块太突兀"。样式表挂一次就够（重复开不叠加）。
  const sbStyle = document.createElement('style');
  sbStyle.id = 'rhine-prefs-sb';
  sbStyle.textContent = `
    #rhine-prefs ::-webkit-scrollbar{width:10px;height:10px}
    #rhine-prefs ::-webkit-scrollbar-track{background:transparent}
    #rhine-prefs ::-webkit-scrollbar-corner{background:transparent}
    #rhine-prefs ::-webkit-scrollbar-thumb{background:rgba(242,241,236,.22);border:2px solid ${PREF.bg};border-radius:6px}
    #rhine-prefs ::-webkit-scrollbar-thumb:hover{background:${PREF.accent}}
  `;
  if (!document.getElementById('rhine-prefs-sb')) document.head.appendChild(sbStyle);

  // 标题栏
  const head = document.createElement('div');
  head.style.cssText = `display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid ${PREF.hair}`;
  head.innerHTML = `<span style="width:6px;height:6px;background:${PREF.fg};display:inline-block"></span>`
    + `<span style="letter-spacing:.14em;white-space:nowrap">${ht('PREFERENCES · Web preferences')}</span>`
    + `<span style="flex:1"></span><span style="color:${PREF.soft};font-size:11px">${ht('In the original this is foobar2000’s native preferences')}</span>`;
  const x = document.createElement('button');
  x.textContent = '✕';
  x.style.cssText = `margin-left:12px;background:none;border:1px solid ${PREF.hair};color:${PREF.fg};font:12px ${PREF.font};padding:2px 8px;cursor:pointer`;
  x.onclick = prefClose;
  head.appendChild(x);
  box.appendChild(head);

  const body = document.createElement('div');
  body.style.cssText = 'padding:6px 16px 18px';
  box.appendChild(body);

  const section = (title) => {
    const t = document.createElement('div');
    t.style.cssText = `margin:16px 0 6px;letter-spacing:.14em;color:${PREF.soft};font-size:11px;border-bottom:1px solid ${PREF.hair};padding-bottom:4px`;
    t.textContent = title;
    body.appendChild(t);
    return body;
  };
  const line = (k, v) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;gap:12px;padding:1px 0';
    d.innerHTML = `<span style="flex:0 0 132px;color:${PREF.soft}">${k}</span><span style="flex:1">${v}</span>`;
    body.appendChild(d);
  };
  const buttons = (list) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px';
    for (const [text, fn, primary] of list) {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = `background:${primary ? PREF.fg : 'transparent'};color:${primary ? PREF.bg : PREF.fg};`
        + `border:1px solid ${primary ? PREF.fg : PREF.hair};font:12px ${PREF.font};padding:5px 12px;cursor:pointer`;
      b.onmouseenter = () => { b.style.background = primary ? PREF.accent : 'rgba(242,241,236,.12)'; b.style.color = primary ? PREF.bg : PREF.fg; };
      b.onmouseleave = () => { b.style.background = primary ? PREF.fg : 'transparent'; b.style.color = primary ? PREF.bg : PREF.fg; };
      b.onclick = fn;
      d.appendChild(b);
    }
    body.appendChild(d);
    return d;
  };

  // ---- 曲库 ----
  section(ht('Library / MEDIA LIBRARY'));
  line(ht('Source'), s.source);
  line(ht('Tracks / albums'), `${s.files} / ${s.albums}`);
  line(ht('Duration / size'), `${s.dur} / ${s.size}`);
  buttons([
    [ht('Choose music folder…'), () => { prefClose(); loadFsLibrary(); }, true],
    [ht('Rescan'), () => { log(ht('Re-scanning the library…')); location.reload(); }],
    [ht('Load demo library'), () => { location.href = location.pathname + '?demo=1'; }],
  ]);
  line('', `<span style="color:${PREF.soft};font-size:11px">${ht('Note: folder-handle persistence (IndexedDB) is not implemented yet, so a rescan asks for the folder again.')}</span>`);

  // ---- 缓存与设置 ----
  section(ht('Cache / CACHE'));
  line(ht('Waveform cache'), ht('Decoded whole-track waveforms live in each panel’s memory (clear to recompute)'));
  buttons([
    [ht('Clear waveform / cover cache'), () => {
      let n = 0;
      for (const p of PANELS) { const w = p.__frame && p.__frame.contentWindow; try { if (w && w.__rhine && w.__rhine.clearCache) n += w.__rhine.clearCache() || 0; } catch (e) { } }
      log(ht('Cache cleared: {0} entries (waveforms are decoded again next time the Signal view opens)', n));
      prefClose();
    }],
    [ht('Reset all settings…'), () => {
      if (!confirm(ht('Clear all settings (colour scheme / view / skin / interface language…) and reload?'))) return;
      try {
        const drop = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (k.indexOf('rhine:file:') === 0 || k.indexOf('rhine:prop:') === 0)) drop.push(k); }
        drop.forEach((k) => localStorage.removeItem(k));
      } catch (e) { }
      log(ht('Settings restored to defaults, reloading…'));
      location.reload();
    }],
  ]);

  // ---- 快捷键 ----
  section(ht('Shortcuts / SHORTCUTS'));
  for (const [k, v] of [
    ['1 – 5', ht('Switch between the five views (Archive / Playlists / Lyrics / Signal / Style)')],
    ['T', ht('Light / dark')],
    ['P', ht('Playlist preset Album ⇄ Index')],
    ['B', ht('Play the intro film')],
    ['S', ht('Shuffle the whole library')],
    ['R', ht('Random pick in the Archive')],
    ['I', ht('Inspect the current album')],
    ['/', ht('Search (filters the Archive in place; other views create a Search playlist)')],
    ['Esc', ht('Leave the search / close overlays')],
    ['Alt+H', ht('Show the status bar again (it hides itself once loading finishes)')],
    ['␣', ht('Play / pause')],
  ]) line(k, v);

  // ---- 关于 ----
  section(ht('About / ABOUT'));
  const ver = (manifest && manifest.text && String(manifest.text['themes/audio-archive/VERSION'] || '').trim()) || '—';
  line(ht('Theme version'), `RhinE ${ver}`);
  line(ht('Port'), ht('RhinE-UI · theme JS byte-identical to the original 1.4.0'));
  line(ht('Manifest built'), (manifest && manifest.built) ? String(manifest.built).replace('T', ' ').slice(0, 19) : '—');
  line(ht('Panels'), `${PANELS.length} · ${manifest ? manifest.files.length : '?'}`);
  line(ht('Viewport / scale'), `${innerWidth}×${innerHeight} @ dpr ${devicePixelRatio}`);
  line(ht('Browser'), (navigator.userAgent.match(/(Chrome|Edg|Firefox|Safari)\/[\d.]+/) || [navigator.userAgent.slice(0, 40)])[0]);
  line(ht('Rendering'), `Canvas 2D · ${document.fonts && document.fonts.check('12px "Geist Mono"') ? ht('Fonts loaded') : ht('Fonts not loaded')}`);

  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) prefClose(); });
  // ⚠️ Esc 必须挂在**每个面板文档**上：整个 UI 都是 iframe，键盘焦点通常还在某个面板里，
  //    只挂顶层文档的话按 Esc 关不掉（实测）。同源，所以能直接给它们的 document 加监听。
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); e.preventDefault();
    prefClose();
    for (const p of PANELS) { try { p.__frame.contentWindow.document.removeEventListener('keydown', onKey, true); } catch (err) { } }
    document.removeEventListener('keydown', onKey, true);
  };
  document.addEventListener('keydown', onKey, true);
  for (const p of PANELS) { try { p.__frame.contentWindow.document.addEventListener('keydown', onKey, true); } catch (err) { } }
  document.body.appendChild(wrap);
  prefEl = wrap;
  applyHostLang();          // HUD 按钮也跟着语言走
  log(ht('Opened the web preferences'));
}


window.__RHINE_ONREADY__ = main;
main().catch((e) => { console.error(e); log('启动失败：' + e.message); });
