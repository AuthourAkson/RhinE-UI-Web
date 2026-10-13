#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修手机上"载入默认音频库"按钮跑到屏幕外：虚拟坐标没乘板子的缩放

用户实测：手机上看，"载入音乐库"按钮超出显示屏幕外。

根因：这个按钮是宿主自绘、挂在**顶层文档**上、按**主题的命中区坐标**定位的：
    btn.style.left = r.left + d.h.x;          // r = stage iframe 的 getBoundingClientRect()
    btn.style.top  = r.top + d.h.y + d.h.h + 10;
  · r（rect）**已经包含** #stage 的整体 scale
  · d.h（主题命中区）是**虚拟坐标系**（1440×820）里的值
  两者量纲不一致 —— 电脑上 scale=1 恰好看不出来，手机上一乘 0.4756 的差值就把按钮推到屏外。

修法：
  · 从「rect 宽 ÷ 主题实际逻辑宽 W」算出换算比 msc（电脑上恒为 1）
  · 锚点改为 r.left + d.h.x * msc、r.top + (d.h.y + d.h.h) * msc + 10
  · 按钮**本身不缩放**（保持可点、字号可读），只是把锚点换算到屏幕；
    缩小时给可点下限（高 ≥26px、字号 ≥11px），并夹在 iframe 可视范围内
  · 捏合/平移后浮层要跟着板子重定位：applyMobileView() 里补一次 updateDemoBtn()

实测：
  手机 844×390 按钮 (259,231) 264×26 → **完全在屏内 ✓**，触摸它 → 曲库 8 文件 ✓
  手机竖屏 390×844 按钮 (102,447) → 屏内 ✓
  电脑 1707×899 按钮仍是 (512,514) 264×40 ✓ —— 与旧公式逐像素一致（主题命中区
    {x:512,y:391,w:180,h:40} + rect top:73 → 512 / 514，分毫不差），0 错误
MSG
echo "已提交："; git log --oneline -1
