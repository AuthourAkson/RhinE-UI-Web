#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修 SIGNAL 的 2D 模式管线不显示：DrawLines 的参数顺序反了

用户实测：signal 页面切到 2D 模式，管线不能正常显示。

复现（量 SIGNAL 中心像素，三种模式）：
  3d 8557 ✓   classic 5979 ✓   **2d 498** ✗   —— 而且**没有任何异常**（不是抛错，是根本没画）

根因：`DrawLines` 的签名我写反了。
  主题的调用（ring.js）：
      gr.DrawLines(col, lw, pts, RING_ROUND)                        // 颜色在前
      gr.DrawLines(withAlpha(glow, a * ga), gw, pts, RING_ROUND)
  我的实现：
      DrawLines(points, lineWidth, colour)                          // 顺序相反 ✗
  → 传进来的 "points" 其实是**颜色数字** → `points.length < 4` 直接 return
  → 2D 环的整条管线（连同脉冲）一笔都不画，且静默无错。

顺带把签名逐个对了一遍，只有它错（其余 7 个一致）：
  DrawLine / DrawRect / DrawEllipse / FillEllipse / DrawPolygon / FillPolygon / FillSolidRect ✓

另外：d2d.StrokeStyle 以前直接把 lineCap/lineJoin 写到**全局 CTX** 上（会串到别的面板/别的画布），
现在只返回样式对象，由 applyStrokeStyle(ctx, style) 在**画线那一刻**作用到那支笔的上下文上
（2D 环要的就是 flat 端帽 + round 连接，见 ring.js 的 RING_ROUND）。

实测：2d 从 **498 → 11204** ✓（现在是三种模式里像素最多的 —— 2D 本来就是粗矢量线画的），
      3d/classic 保持 8557/5979 不变 ✓，控制台错误 0 ✓。
MSG
echo "已提交："; git log --oneline -1
