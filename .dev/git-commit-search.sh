#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
实现自动播放列表，修复 SEARCH ARCHIVE 搜不到东西

用户实测：在搜索框里搜 world，界面显示 no playlist、什么结果都没有。

主题的搜索是**自动播放列表**（header.js:309-322，只在非档案视图走这条：
  档案视图里是就地过滤货架）。它调用的三个接口在本移植里全是 stub：
    plman.CreateAutoPlaylist(idx, "Search", q, sort, 0)  → 返回 -1，列表根本建不出来
    plman.IsAutoPlaylist(idx)                            → false
    plman.RemovePlaylist(idx)                            → 空实现
  于是"Search"列表不存在，界面就报 no playlist。

实现：
· CreateAutoPlaylist：在 shim 里按查询语句从曲库算出曲目，再让宿主在指定下标建列表
  （宿主命令 auto-playlist:<下标>:<名字>:<曲目索引>；列表对象带 auto:true 供 IsAutoPlaylist 判断）。
  查询语言实现的是主题实际生成的**最小子集**：
    "( %title% HAS 词 OR %artist% HAS 词 OR … ) [AND (…)]"，HAS = 不区分大小写的包含；
  排序格式按 `|` 分段逐字段比较（音轨/碟号按数值），对应主题传的
    "%album artist% | %date% | %album% | %discnumber% | %tracknumber%"。
· IsAutoPlaylist / RemovePlaylist（宿主 delete-playlist，并修正活动列表等下标）。
· InsertPlaylistItemsFilter：主题的整库随机（bus.js:76）不带过滤条件调用它，
  语义等同普通插入 —— 顺带把 S 键"整库随机"也修好了。
· ⚠️ 又踩到一次"重复键覆盖"：文件后面原有一行 `RemovePlaylist: () => { }`，
  对象字面量里同名键后者覆盖前者，会把新实现盖掉 —— 已删除并注明。

另外两个连带 bug：
1. 搜不到东西时反而显示第 0 首：宿主解析曲目段用 ''.split(',') = ['']，
   Number('') = 0 → 把第 0 首当结果插了进去。加 filter(Boolean) 后 0 结果就是空列表。
2. 切换列表后面板残留空行：native/playlist.js 的 buildRows() 排在 schedule() 之前，
   而更新 PL 的 syncState() 在 schedule() 里 —— 于是切到 "Search" 的第一帧按旧列表建行
   （实测 rows=7 而新列表只有 1 首，界面留下 6 行 00:00）。现在 buildRows() 先 syncState()。

验证（1707×899 @dpr1.5，宿主列表 + 面板行数 + 可见行内容逐一核对）：
  world         → Search(1)，面板 1 行：world.execute (me) ;
  bomb          → Search(1)，面板 1 行：bombinsound（替换而不是新增）
  zzzznotfound  → Search(0)，面板 0 行（无残留空行）
  world（再来）  → Search(1)，面板 1 行
  档案视图内搜 world → 过滤条 "FILTER · WORLD · 1 ALBUM"，货架只剩 Miracle Milk，
                       ALBUM / SELECT 01 / 01
MSG
echo "已提交："; git log --oneline -1
