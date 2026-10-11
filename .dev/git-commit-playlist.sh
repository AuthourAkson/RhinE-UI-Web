#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 改动 ==="
git status --short | head -30
echo
git add -A
git commit -q -F - <<'MSG'
02 PLAYLISTS：用 DOM 复刻 Columns UI 的原生播放列表

原版这一块是 Columns UI 的原生 Playlist View（不是 JSplitter 面板），主题里没有它的代码，
网页版此前只有一个占位 div。现在用 native/playlist.js 以 DOM 复刻，放在 native/ 而不是主题目录里，
保持 themes/audio-archive 与原版 1.4.0 逐字节一致。

列的定义全部取自主题自己的资源，不另造一套：
· columns/preset-<preset>.json  —— 列标题、固定宽度、伸展权重、对齐
· columns/preset-<preset>-*.fcl —— 每列的显示格式（Columns UI 的 title format 串）：
    album  $num(%tracknumber%,2) · %title% · $if($stricmp(%artist%,%album artist%),,%artist%) · %length% · $num(%list_index%,3)
    index  $num(%list_index%,3) · %title% · %artist% · %album% · $left(%date%,4) · %length%
  以及 album 预设的分组头（$upper(album artist · album)[ · DISC n] + 制表符右对齐的年份/编码）
· lib/core.js 的颜色 C / dp / font / mix、lib/playlists.js 的列表缓存

对齐：columnLayout() 与 head.js 的版本逐字一致（含按 utils.GetSystemMetrics(2) 让位滚动条），
行高用同一个 TOKENS.metrics.row —— head 画的列标题与这里每一列严格对齐（实测两边的
列 x/宽完全相同：[]0/6 · NO.6/46 · TITLE52/578 · ARTIST630/293 · TIME923/64 · POS987/56）。

功能：ALBUM/INDEX 两套预设、分组头、正在播放行整行橙色（同 .fcl 的 $set_style(back,$rgb(255,122,1))）、
选中行浅色底板、单击选择 / Shift 范围 / Ctrl 切换、双击播放、方向键与 PageUp·Down·Home·End、Enter/Space、
右键菜单（播放 / 移除）、点列标题排序、双击重命名、行虚拟化（大播放列表只渲染可见行）、
宿主的 EnsurePlaylistItemVisible 滚动联动。

顺带修掉三处宿主/接口层的错误：
1. worker 的索引项漏了 size 与 file —— 播放列表头总体积永远显示 0 KB，
   且用"选择目录"加载的曲库没有可播放来源（trackSrc 依赖 t.file 生成 blob URL）
2. plman.SetPlaylistSelectionSingle 实现成了"替换选择"，而 Columns UI 的语义是**追加**，
   导致 manager/transport 构造的多选只剩最后一项（主题自己就是 Clear + 逐项 SetSingle(true)）
3. LIB.focus 的语义混乱：plman.GetPlaylistFocusItemIndex 要的是播放列表项下标，
   而 playIndex/GetFocusItem 把它当曲库曲目下标（演示库两者恰好相同所以没暴露）。
   现在 focus/selection.items/playing.item 统一为播放列表项下标，曲目下标放在 focusTrack

新增/实装的 plman 接口：ClearPlaylistSelection、EnsurePlaylistItemVisible、RemovePlaylistSelection、
SortByFormat/V2、RenamePlaylist、FindOrCreatePlaylist、IsPlaylistItemSelected、
GetPlaylistSelectedIndexes（真实多选）、句柄列表的 CalcTotalDuration/CalcTotalSize。

验证（1707×899 CSS @dpr1.5，用户真实环境）：
· 五个视图全部出图、零报错；档案视图 PLAY ALBUM 仍正常（playing=true）
· 播放列表 11 行 = 7 曲目 + 4 分组头，列与 head 完全一致
· 单击 → focus/selection 正确；Shift → [0,1,2,3]；Ctrl → 增删单项；双击 → 真的开始播放
· 点 TITLE 列 → 按标题排序（原始顺序 [0..6] → [1,2,4,5,6,0,3]）
· LAYOUT 切 INDEX → 7 列、分组头消失；总体积 0 → 8 MB
MSG
echo "已提交："
git log --oneline -1
