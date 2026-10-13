#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
手机适配 A+B：触摸桥接 + 手机"虚拟桌面"（电脑端零改动、已验证零回归）

需求：手机上能看能用，且**不能影响电脑上的查看**。

实测发现（先量后做）：
  · 主题每个面板内部是"按宽屏写死的排版"——390 竖屏下 header 元素互相重叠、transport 左侧被裁；
    但 frame.js 的 regions() **完全按 root 面板的 W/H 计算**。
  · 平板（768×1024 → stage 768×855、1024×768 → stage 1024×599）本来就很好用，只差触摸。

A. 触摸桥接（shim，纯新增，主题一行不改）：
   · 单指 → mousemove(先落 hover，主题命中区才准) + mousedown/mouseup(左键)
   · 长按 500ms → 右键（主题上下文菜单），且这次抬起不再发左键
   · 300ms 内两次轻点 → dblclick
   · **双指** → 不翻译成鼠标，改为把原始手势（页面坐标）postMessage 给宿主做缩放/平移，
              并先给已按下的左键补一个 up，避免鼠标状态卡住
   · touchstart 里 preventDefault()（passive:false）阻止浏览器补发兼容鼠标事件，时间戳兜底去重

B. 手机"虚拟桌面 + 双指缩放"（宿主，触发条件刻意收窄：**触摸设备 且 短边 < 700**）：
   · root 面板按 **1440×820 虚拟尺寸**渲染 → 主题排布与桌面**逐像素一致**
   · #stage 整体 transform: scale(fit) + 双指缩放（以捏合中心为锚点，0.8×fit ~ 4×）与单指/双指平移
   · 有效 DPR = clamp(devicePixelRatio × fitScale, 1, 2)：1440 逻辑宽在 dpr3 屏幕上只需 ~1.43，
     画布从 4320px 降到 **2055px**（省约 4 倍像素，且 1:1 不模糊）
   · 竖屏给一句 4 秒淡出的"横屏更完整·双指可缩放"提示（不阻挡操作）
   · 平板/电脑完全不进这条分支：电脑端 #stage 无 transform、coarse=false、布局与画布分辨率原样

验证（CDP 设备仿真 + 真实触摸事件）：
  手机 844×390 @dpr3、coarse=true：虚拟桌面 1440×820 → #stage 685×390（正好铺满）、
    画布 2055×929；触摸 demo 按钮 → 曲库 8 文件 ✓；触摸主题 mode 命中区 → **MODE dark→light ✓✓**；
    双指缩放 → scale 0.4756 → 0.7927（锚点保持）✓；AR.hover 由 -1 → 0（on_mouse_move 确实收到）✓；错误 0
  电脑 1707×899 @dpr1.5、coarse=false：无 transform ✓；信号中心像素 3d=8557 / 2d=11204 / classic=5979
    —— **三项精确命中改动前基线** ✓✓；错误 0
MSG
echo "已提交："; git log --oneline -1
