#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修手机上"载入默认音频库"按钮大小不跟随缩放：去掉保底，改成与主题按钮同比例

用户实测：位置对了，但缩放时按钮大小固定不变，应该和上方那个"加入本地文件夹"按钮一样大。

原因：我上一版给宿主按钮加了"最小 26px 高 / 字号 ≥11px"的**可点保底**，
而主题自己的按钮是画在画布上、**跟着 #stage 一起缩放**的（手机上 40×0.4756 ≈ 19px 高、字号 5.23px）
→ 保底让宿主按钮比主题按钮大了一圈。

修法：高度 / 字号 / 内边距 / 字距全部按同一个换算比 k 缩放，与主题按钮逐项对齐：
    height  = round(d.h.h * k)
    padding = 0 round(18 * k) px
    letterSpacing = 0.14 * k em
    fontSize = (d.size * k) px          // d.size 直接读主题的 stSize(AR_ST.btn)
    top      = r.top + (d.h.y + d.h.h) * k + 10 * min(k,1)
放大不再靠保底，而是双指缩放（整块板子变大，applyMobileView() 会重新调用本函数）。

实测（宿主按钮 vs 主题按钮）：
  手机 844×390，k=0.4756：主题实际 19px / 5.23px  ←→  宿主 19px / 5.23px / padding 9px  一致 ✓
  电脑 1707×899，k=1     ：主题 40px / 11px      ←→  宿主 40px / 11px / padding 18px  **与改动前完全一致** ✓
  裁图目视：两个按钮高度/字号/字距相同，仅文案长度导致宽度不同（+ ADD MUSIC FOLDER vs
  + LOAD DEFAULT AUDIO LIBRARY）。
MSG
echo "已提交："; git log --oneline -1
