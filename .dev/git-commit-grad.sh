#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修复 FillGradRect：跨度与方向都错了 —— 三处渐变看起来都像纯色块

D2D 的 angle 从 +x 轴顺时针（屏幕 y 向下）：0° = 左→右，90° = 上→下，c1 在起点。
渐变轴穿过矩形中心，跨度必须取"矩形在该方向上的投影" |w·cos| + |h·sin|。

旧实现用 max(w, h) 当跨度、并把 dy 取了负号，于是：
· archive.js:650 播放栏上方那条黑带（arrayW×81dp）拿到 1074px 的跨度，
  只用到整条渐变的 7%，画出来几乎恒定，然后在带子底边硬切
  —— 就是"阵列没有向下淡出、只像盖了一层透明"的现象
· archive.js:649 阵列向右侧卡片淡出（101×733dp）7× 过宽
· grid.js:183 网格内容自上而下淡入（1074×18dp）60× 过宽
· 方向取反：该"上透明→下入底色"的地方画成了反向

验证（纯阵列区 x∈[180,360] 按行测相对底色的残留，1× 窗口）：
  dp170→140 平均偏差 50-52（正常内容，带子上方）
  dp139 51 → dp120 44 → dp100 33 → dp85 24 → dp70 9 → dp62 2 → dp60 0
  即 80dp 带子内平滑降到 0；dp60→0 纯色区为 0（与主题的 FillSolidRect 一致）
MSG
echo "已提交："
git log --oneline -1
