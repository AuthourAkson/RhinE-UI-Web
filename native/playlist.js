"use strict";
// 02 · PLAYLISTS 视图里的原生列表 —— Columns UI 的 Playlist View，在网页版里用 DOM 复刻。
//
// 为什么单独一个文件：原版这一块不是脚本面板（是 Columns UI 的原生控件），主题里没有它的代码。
// 放在 native/ 而不是 themes/audio-archive/ 里，是为了保持主题目录与原版 1.4.0 逐字节一致。
//
// 资源全部取自主题自己：
//   · columns/preset-<preset>.json                 —— 列标题、固定宽度、伸展权重、对齐
//   · columns/preset-<preset>-<scheme>-<mode>.fcl   —— 每列的显示格式（Columns UI 的 title format 串）
//   · lib/core.js（C / dp / font / tr / mix）        —— 与别的面板同一套颜色、字号、缩放
//   · lib/playlists.js（plItems / plDirty）          —— 曲目列表缓存
// 列宽算法与 head.js 的 columnLayout() 必须一致（含滚动条让位），这样 head 画出的列标题与这里每一列
// 严格对齐；行高也用同一个 TOKENS.metrics.row，head 才能算准"要不要让出滚动条宽度"。

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");
include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\playlists.js");

let W = 0, H = 0, PL = -1;

const ROW = dp(TOKENS.metrics.row);                              // 24dp 行高
const FS = dp(Math.round(TOKENS.fonts.list.pt * 1.333));         // 9pt ≈ 12dp（Columns UI 字体以 pt 计）
const GFS = dp(Math.round(TOKENS.fonts.group.pt * 1.333));       // 分组头字号
const SBW = utils.GetSystemMetrics(2);                           // 竖直滚动条宽度（head.js 也用这个值）

// ---------------------------------------------------------------------------------------------- 列显示格式
// 逐字来自主题的 Columns UI 预设（columns/preset-<preset>-<scheme>-<mode>.fcl 的 Columns 段）：
//   album 第0列 $if(%isplaying%,$set_style(back,$rgb(255,122,1),…))  ← 只负责整行底色
//         $num(%tracknumber%,2) · %title% · $if($stricmp(%artist%,%album artist%),,%artist%) · %length% · $num(%list_index%,3)
//   index 第0列同上 · $num(%list_index%,3) · %title% · %artist% · %album% · $left(%date%,4) · %length%
const COL_FMT = {
    album: ["rowStyle", "trackNo", "title", "artistUnlessAlbumArtist", "length", "listIndex"],
    index: ["rowStyle", "listIndex", "title", "artist", "album", "year", "length"],
};
const $upper = (s) => String(s == null ? "" : s).toUpperCase();
const pick = (t, ...keys) => { for (const k of keys) { const v = t && t[k]; if (v != null && v !== "") return v; } return ""; };
const num = (v, w) => (v == null || v === "" ? "" : pad(v, w));
const FIELDS = {
    trackNo: (t) => num(pick(t, "track", "tracknumber"), 2),
    listIndex: (t, i) => pad(i + 1, 3),
    title: (t) => pick(t, "title"),
    artist: (t) => pick(t, "artist"),
    album: (t) => pick(t, "album"),
    year: (t) => String(pick(t, "year", "date")).slice(0, 4),
    length: (t) => fmtTime(pick(t, "length") || 0),
    artistUnlessAlbumArtist: (t) => {
        const a = String(pick(t, "artist")), aa = String(pick(t, "albumArtist", "album_artist", "artist"));
        return a.toLowerCase() === aa.toLowerCase() ? "" : a;
    },
};
const cellText = (kind, t, i) => (FIELDS[kind] ? FIELDS[kind](t, i) : "");

// 分组头（album 预设 Groups 段）：$upper([%album artist%][ · %album%])[ · DISC %discnumber%]$char(9)[年份 · ]$upper(%codec%)…
// $char(9) 是制表符 —— Columns UI 里它把后面内容右对齐，这里用左右两段复刻。
function groupLeft(t) {
    const aa = pick(t, "albumArtist", "album_artist", "artist"), al = pick(t, "album"), disc = pick(t, "disc", "discnumber");
    return $upper(aa) + (al ? " · " + $upper(al) : "") + (disc && String(disc) !== "1" ? " · DISC " + disc : "");
}
function groupRight(t) {
    const yy = String(pick(t, "year", "date")).slice(0, 4), codec = $upper(pick(t, "codec"));
    const bits = pick(t, "bits"), rate = Number(pick(t, "rate")) || 0;
    const spec = bits ? `${bits}/${Math.round(rate / 1000)}kHz` : rate ? `${Math.round(rate / 1000)}kHz` : "";
    return [(yy ? yy + " · " : "") + codec, spec].filter(Boolean).join(" ").trim();
}

// ---------------------------------------------------------------------------------------------- 预设与列宽
const PRESET_META = {};
function presetMeta() {
    const p = STATE.preset;
    if (!PRESET_META[p]) {
        try { PRESET_META[p] = JSON.parse(utils.ReadTextFile(THEME_ROOT + `columns\\preset-${p}.json`, 65001)); }
        catch (e) { PRESET_META[p] = { groups: false, columns: [] }; }
    }
    return PRESET_META[p];
}
// ⚠️ 与 head.js 的 scrollBarShown() 必须得出同一结论，否则列标题会差一个滚动条宽度
const TF_GROUP = fb.TitleFormat("$lower(%album artist%|%album%|%discnumber%)");
let groupRows = { items: null, n: 0 };
function scrollBarShown(meta) {
    if (PL < 0 || !H) return false;
    const items = plItems(PL);
    if (items.Count * ROW > H) return true;
    if (!meta.groups) return false;
    if (groupRows.items !== items) {
        const keys = TF_GROUP.EvalWithMetadbs(items);
        let n = 0;
        keys.forEach((k, i) => { if (!i || k !== keys[i - 1]) n++; });
        groupRows = { items, n };
    }
    return (items.Count + groupRows.n) * ROW > H;
}
// ⚠️ 与 head.js 的 columnLayout() 逐字一致
function columnLayout(meta) {
    const cols = meta.columns, client = W - (scrollBarShown(meta) ? SBW : 0);
    const fixed = cols.reduce((a, c) => a + dp(c.width), 0), weights = cols.reduce((a, c) => a + c.resize, 0);
    let x = 0;
    return cols.map((c) => {
        const w = dp(c.width) + (weights ? (client - fixed) * c.resize / weights : 0);
        const r = { c, x, w };
        x += w;
        return r;
    });
}

// ---------------------------------------------------------------------------------------------- DOM 骨架
const css = (argb) => `rgba(${(argb >>> 16) & 255},${(argb >>> 8) & 255},${argb & 255},${(((argb >>> 24) & 255) || 255) / 255})`;
const FONT = '"Geist Mono", "Microsoft YaHei UI", monospace';

const scroll = document.createElement("div");
const sizer = document.createElement("div");
const layer = document.createElement("div");
scroll.appendChild(sizer); scroll.appendChild(layer);
scroll.style.cssText = "position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;outline:none";
sizer.style.cssText = "width:1px";
layer.style.cssText = "position:absolute;left:0;top:0;right:0";
document.body.appendChild(scroll);
scroll.tabIndex = 0;
const styleEl = document.createElement("style");
styleEl.textContent = [
    ".prow{position:absolute;left:0;right:0;white-space:nowrap}",
    ".prow span{position:absolute;top:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}",
    ".prow.group span{letter-spacing:.14em;font-weight:600}",
    `::-webkit-scrollbar{width:${SBW}px;height:${SBW}px}`,
    "::-webkit-scrollbar-thumb{background:#55554f}",
    "::-webkit-scrollbar-track{background:transparent}",
].join("");
document.head.appendChild(styleEl);

// ⚠️ 面板背景必须自己铺：这块区域在原版是 **Columns UI 的原生 Playlist View**，它自带不透明背景，
//    会盖住主题根面板（frame.js）画在下面的"区域底板"；网页版这里是 DOM 面板，
//    不铺底色就会露出底板 —— 实测表现为曲目表右侧（ARTIST / TIME / POS 那几列下方）
//    出现一大块浅灰，原版没有（用户实测）。铺上主题的窗口底色后与原版一致。
document.documentElement.style.background = css(C.bg);
document.body.style.background = css(C.bg);

// ---------------------------------------------------------------------------------------------- 行模型
let layout = [];
let rows = [];                 // [{group:true,text,right} | {i}]
let pool = [];
let focus = -1, playing = -1, selected = new Set(), anchor = -1;

function tracksOf() { return (window.__RHINE_LIBRARY__ || {}).tracks || []; }
function trackAt(handle) { const t = tracksOf(); return handle && handle.__id != null ? t[handle.__id] : null; }

function buildRows() {
    // ⚠️ 先同步 PL 再建行：事件回调（on_playlists_changed / on_playlist_switch）里
    //    buildRows() 排在 schedule() 之前，而更新 PL 的 syncState() 是 schedule() 里才跑的 ——
    //    于是切换播放列表（例如搜索新建 "Search"）后的第一帧会按**旧列表**建行：
    //    实测 rows=7 而新列表只有 1 首，界面就留下 6 行 00:00 的空行。
    syncState();
    rows = [];
    if (PL < 0) { groupRows = { items: null, n: 0 }; return; }
    const items = plItems(PL), meta = presetMeta();
    if (meta.groups && items.Count) {
        const keys = TF_GROUP.EvalWithMetadbs(items);
        for (let i = 0; i < items.Count; i++) {
            if (!i || keys[i] !== keys[i - 1]) { const t = trackAt(items.Item(i)) || {}; rows.push({ group: true, text: groupLeft(t), right: groupRight(t) }); }
            rows.push({ i });
        }
    } else {
        for (let i = 0; i < items.Count; i++) rows.push({ i });
    }
}

function makeRow(r) {
    const el = document.createElement("div");
    el.className = "prow" + (r.group ? " group" : "");
    el.style.height = ROW + "px";
    el.style.lineHeight = ROW + "px";
    el._group = !!r.group;
    if (r.group) {
        const a = document.createElement("span"), b = document.createElement("span");
        el.appendChild(a); el.appendChild(b);
        el._parts = [a, b];
    } else {
        el._parts = layout.map(() => { const s = document.createElement("span"); el.appendChild(s); return s; });
    }
    return el;
}

function styleRow(el, r) {
    const play = !r.group && r.i === playing, sel = !r.group && selected.has(r.i);
    const fg = play || sel ? C.bg : mix(C.fg, C.bg, .45);
    el.style.background = play ? css(C.accent) : sel ? css(C.fg) : "transparent";
    if (r.group) {
        el.style.fontSize = GFS + "px";
        el.style.borderBottom = `1px solid ${css(C.hair)}`;
        const [a, b] = el._parts;
        for (const s of el._parts) { s.style.color = css(C["text-muted"]); s.style.top = "0"; }
        a.style.left = dp(6) + "px"; a.style.right = dp(6) + "px"; a.style.textAlign = "left";
        b.style.left = dp(6) + "px"; b.style.right = dp(6) + "px"; b.style.textAlign = "right";
        a.textContent = r.text; b.textContent = r.right;
        return;
    }
    el.style.fontSize = FS + "px";
    const items = PL >= 0 ? plItems(PL) : null;
    const t = items ? trackAt(items.Item(r.i)) : null;
    const fmt = COL_FMT[STATE.preset] || COL_FMT.album;
    layout.forEach((col, ci) => {
        const s = el._parts[ci], kind = fmt[ci] || "title";
        const right = col.c.align === "right";
        s.style.left = Math.round(right ? col.x : col.x + dp(6)) + "px";
        s.style.width = Math.max(0, Math.round(col.w - dp(right ? 6 : 8))) + "px";
        s.style.textAlign = right ? "right" : "left";
        s.style.color = css(fg);
        s.textContent = kind === "rowStyle" ? "" : cellText(kind, t || {}, r.i);
    });
}

function render() {
    layout = columnLayout(presetMeta());
    sizer.style.height = rows.length * ROW + "px";
    const first = Math.max(0, Math.floor(scroll.scrollTop / ROW) - 2);
    const count = Math.max(1, Math.ceil(H / ROW) + 5);
    const visible = rows.slice(first, first + count);
    while (pool.length < visible.length) { const el = makeRow(visible[pool.length] || {}); layer.appendChild(el); pool.push(el); }
    for (let k = 0; k < pool.length; k++) {
        const r = visible[k];
        if (!r) { pool[k].style.display = "none"; continue; }
        let el = pool[k];
        const wired = el._group === !!r.group && (r.group || (el._parts && el._parts.length === layout.length));
        if (!wired) { layer.removeChild(el); el = makeRow(r); layer.appendChild(el); pool[k] = el; }
        el.style.display = "block";
        el.style.top = first * ROW + k * ROW + "px";
        el._row = r;
        styleRow(el, r);
    }
}

let pending = false;
function schedule() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; syncState(); render(); }); }
function syncState() {
    PL = plman.ActivePlaylist;
    focus = PL >= 0 ? plman.GetPlaylistFocusItemIndex(PL) : -1;
    selected = new Set(PL >= 0 ? plman.GetPlaylistSelectedIndexes(PL) : []);
    const loc = plman.GetPlayingItemLocation();
    playing = loc && loc.IsValid && loc.PlaylistIndex === PL ? loc.PlaylistItemIndex : -1;
}

// ---------------------------------------------------------------------------------------------- 交互
const rowIndexOf = (i) => rows.findIndex((r) => !r.group && r.i === i);
function rowAt(clientY) {
    const rect = scroll.getBoundingClientRect();
    const idx = Math.floor((clientY - rect.top + scroll.scrollTop) / ROW);
    return idx >= 0 && idx < rows.length ? rows[idx] : null;
}
function selectRow(i, e) {
    if (PL < 0 || i < 0) return;
    if (e && e.shiftKey && anchor >= 0) {
        const a = Math.min(anchor, i), b = Math.max(anchor, i);
        plman.ClearPlaylistSelection(PL);
        for (let k = a; k <= b; k++) plman.SetPlaylistSelectionSingle(PL, k, true);
        plman.SetPlaylistFocusItem(PL, i);
    } else if (e && (e.ctrlKey || e.metaKey)) {
        anchor = i;
        if (selected.has(i)) { plman.ClearPlaylistSelection(PL); for (const k of selected) if (k !== i) plman.SetPlaylistSelectionSingle(PL, k, true); }
        else plman.SetPlaylistSelectionSingle(PL, i, true);
        plman.SetPlaylistFocusItem(PL, i);
    } else {
        anchor = i;
        plman.ClearPlaylistSelection(PL);
        plman.SetPlaylistSelectionSingle(PL, i, true);
        plman.SetPlaylistFocusItem(PL, i);
    }
    schedule();
}
const playRow = (i) => { if (PL >= 0 && i >= 0) plman.ExecutePlaylistDefaultAction(PL, i); };

scroll.addEventListener("mousedown", (e) => {
    const r = rowAt(e.clientY);
    if (!r) return;
    if (e.button === 2) { if (!r.group && !selected.has(r.i)) selectRow(r.i, null); return; }
    if (r.group) return;
    selectRow(r.i, e);
    scroll.focus();
    e.preventDefault();
});
scroll.addEventListener("dblclick", (e) => { const r = rowAt(e.clientY); if (r && !r.group) playRow(r.i); });
scroll.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const r = rowAt(e.clientY);
    if (r && !r.group) menu(e.clientX, e.clientY);
});
scroll.addEventListener("scroll", () => schedule());

let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
function menu(x, y) {
    closeMenu();
    menuEl = document.createElement("div");
    menuEl.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9;background:${css(C.bg)};border:1px solid ${css(C["line-faint"])};font:${FS}px ${FONT};color:${css(C.fg)};padding:4px 0;min-width:150px`;
    const add = (label, fn) => {
        const it = document.createElement("div");
        it.textContent = label;
        it.style.cssText = "padding:4px 14px";
        it.onmouseenter = () => { it.style.background = css(C.fg); it.style.color = css(C.bg); };
        it.onmouseleave = () => { it.style.background = "transparent"; it.style.color = css(C.fg); };
        it.onmousedown = (ev) => { ev.preventDefault(); ev.stopPropagation(); closeMenu(); fn(); };
        menuEl.appendChild(it);
    };
    add(tr("Play"), () => { const f = plman.GetPlaylistFocusItemIndex(PL); playRow(f >= 0 ? f : 0); });
    add(tr("Remove"), () => { plman.RemovePlaylistSelection(PL); plDirty(PL); buildRows(); schedule(); });
    document.body.appendChild(menuEl);
}
document.addEventListener("mousedown", (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);

function ensureVisible(i) {
    const ri = rowIndexOf(i);
    if (ri < 0) return;
    const y = ri * ROW;
    if (y < scroll.scrollTop) scroll.scrollTop = y;
    else if (y + ROW > scroll.scrollTop + H) scroll.scrollTop = y + ROW - H;
}
function moveTo(i, shift) {
    if (PL < 0) return;
    const n = plItems(PL).Count;
    const next = clamp(i, 0, Math.max(0, n - 1));
    selectRow(next, shift ? { shiftKey: true } : null);
    ensureVisible(next);
}

function on_key_down(vk) {
    if (searchKey(vk)) return true;
    const page = Math.max(1, Math.floor(H / ROW) - 1), n = PL >= 0 ? plItems(PL).Count : 0, cur = focus >= 0 ? focus : 0;
    if (vk === 0x26) { moveTo(cur - 1); return true; }
    if (vk === 0x28) { moveTo(cur + 1); return true; }
    if (vk === 0x21) { moveTo(cur - page); return true; }
    if (vk === 0x22) { moveTo(cur + page); return true; }
    if (vk === 0x24) { moveTo(0); return true; }
    if (vk === 0x23) { moveTo(n); return true; }
    if (vk === 0x0D) { playRow(focus); return true; }
    if (vk === 0x20) { fb.PlayOrPause(); return true; }
    return globalKey(vk);
}
function on_char(code) { searchChar(code); }
const KEYS = { ArrowUp: 0x26, ArrowDown: 0x28, PageUp: 0x21, PageDown: 0x22, Home: 0x24, End: 0x23, Enter: 0x0D, " ": 0x20, "/": 0xBF };
window.addEventListener("keydown", (e) => {
    const vk = KEYS[e.key];
    if (vk == null) return;
    if (on_key_down(vk)) e.preventDefault();
});

// ---------------------------------------------------------------------------------------------- 回调
function on_size(w, h) { W = w; H = h; schedule(); }
function on_playlist_switch() { groupRows = { items: null, n: 0 }; buildRows(); schedule(); }
function on_playlists_changed() { plDirty(); groupRows = { items: null, n: 0 }; buildRows(); schedule(); }
function on_playlist_items_added(i) { plDirty(i); if (i === PL) { groupRows = { items: null, n: 0 }; buildRows(); schedule(); } }
function on_playlist_items_removed(i) { plDirty(i); if (i === PL) { groupRows = { items: null, n: 0 }; buildRows(); schedule(); } }
function on_playlist_items_reordered(i) { plDirty(i); if (i === PL) { buildRows(); schedule(); } }
function on_item_focus_change() { schedule(); }
function on_playlist_items_selection_change() { schedule(); }
function on_playback_new_track() { schedule(); }
function on_playback_stop(reason) { if (reason !== 2) schedule(); }
function on_colours_changed() { refreshTokens(); schedule(); }
onMessage("state", () => { groupRows = { items: null, n: 0 }; buildRows(); schedule(); });
onMessage("ensure-visible", (pl, i) => { if (pl === PL) { ensureVisible(i); schedule(); } });
send("hello");
buildRows();
schedule();
