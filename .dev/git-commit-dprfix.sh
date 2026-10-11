#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 改动 ==="
git status --short | head -30
echo
git add -A
git commit -q -F - <<'MSG'
修复 dpr≠1（Windows 150% 缩放）下的布局错乱：SetTransform 抹掉了 DPR 基准

症状（只在 dpr=1.5 的浏览器里出现，dpr=1 时完全正常，所以本地自测永远发现不了）：
· 封面四边形 / 标题条 / 脊标缩到 2/3 并错位 → “磁带缩小、文字浮在半空”
· 观感像有两条传送带：一条是 2/3 缩放的内容，另一条是 1:1 的磁带外壳
· 资料卡离屏层在 150% 下是被放大 1.5 倍的糊图

原因：画布的基础变换是 DPR 缩放（后备画布 = W×DPR，主题按 CSS px 绘制），
但 shim 的 SetTransform/ResetTransform 一律 setTransform(1,0,0,1,0,0)，
把基准清成了单位矩阵。而主题的 quadImage / drawSpineLabel / drawTopTitle /
renderLayer 全是「SetTransform(仿射矩阵) → 画 → ResetTransform」的写法，
于是这些内容被当成设备像素处理。

修复：
· makeGr 记住每个绘图上下文自己的基准变换（主画布 = DPR，离屏层 = 自己的 DPR），
  SetTransform / ResetTransform 回到该基准而不是单位矩阵
· CreateImage 按 DPR 建后备画布（图像逻辑尺寸不变），资料卡在 150% 下恢复清晰
· DrawImage / DrawEffect 的源矩形按图像自身 __dpr 换算

验证（与原版参考图完全同条件：1349×777 CSS @dpr1.5、同一首 Mili 单曲）：
  封面四角橙色标记（设备像素）
    原版    (343,523) (522,606) (343,693) (522,776)
    修复后  (346,525) (525,607) (346,693) (525,777)   —— 误差 ≤3px
  磁带白壳像素数：原版 3409 / 修复前 1845 / 修复后 3549
dpr=1 回归：面板尺寸、布局锚点（infoX=1098、arrayW=1074、工具栏距卡片 56dp、
ALBUM/SELECT 距播放栏 148dp）、曲库与选中状态均不变。

顺带：serve.mjs 的清单扫描跳过 .git / node_modules / chrome-profile
（建立仓库后清单从 5241 个文件 / 479MB 降到 2435 / 244MB）
MSG
echo "已提交："
git log --oneline -1
