#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
# 这些 *.txt 是探针的原始输出，留着当证据但要精简：只保留结论性的 mjs 探针
rm -f .dev/all-out.txt .dev/arch-out.txt .dev/lay-out.txt .dev/lay2-out.txt .dev/narrow-out.txt .dev/titles-out.txt .dev/tr-out.txt .dev/tr2-out.txt
git add -A
git commit -q -F - <<'MSG'
诊断脚本：名称显示排查（播放列表两种布局 / 档案 TRACKS 模式 / 窄窗口 / ID3 标签）

用户报告"playlist 页面里 musiclab 下除 world.execute(me) 外其它曲目名称显示不出来"。
逐处探针化验证，结论是移植侧没有问题，重新打开页面后即正常（旧页面还持有切换前的状态）：

· .dev/titles-probe.mjs    播放列表逐行逐列 dump
· .dev/layout-probe2.mjs   用主题自己的 send("preset") 切 ALBUM ⇄ INDEX
· .dev/archive-tracks2.mjs 调 setUnit("tracks") 切"每首一个盒子"
· .dev/narrow-probe.mjs    四种窗口尺寸下的列宽（发现 ≤1100 CSS px 时标题列会被
                           主题自己的列宽算法压到 0 宽 —— 保真行为，不改版式）
· .dev/tags-check.mjs      用项目解析器读 musiclab 全部文件的标签
· .dev/id3-check.mjs       独立读 ID3v2/ID3v1，交叉验证结论

结论：除 Mili 一首外，其余 6 个文件是**完全无标签**的裸 MP3（无 ID3v2、末尾也无 ID3v1 的
"TAG"），所以标题来自文件名兜底、艺人/专辑字段本就为空 → 界面显示 UNKNOWN 属正常表现
（原版 foobar2000 对无标签文件同样如此）。

实测各处均正常显示名称：播放列表 INDEX/ALBUM 两种布局、底部正在播放栏、
档案视图专辑卡片曲目表、档案 SHOW:TRACKS 的盒子标签、卡片 QUEUE/NEXT。
MSG
echo "已提交："; git log --oneline -1
