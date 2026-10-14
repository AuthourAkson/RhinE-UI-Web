#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修手机上"竖屏↔横屏来回一次后比例变了、右侧被切掉"：缩放只增不减

用户实测：手机上竖屏→横屏→再转回竖屏后，页面比例变了，只显示左边一部分，
右侧的 PREFS 与 MENU 刚好都看不见。

根因：layoutView() 里写成了"只增不减"：
    mScale = mScale > 0 ? Math.max(mScale, fitScale()) : fitScale();
  竖屏 fit = 0.2708 → 横屏 fit = 0.4756 → **转回竖屏时仍保留 0.4756** →
  板子宽 1440×0.4756 = 685px 而屏宽只有 390px → 只显示左边，右侧的 PREFS / MENU 被切掉。

修法：屏幕**方向变化**（或尺寸明显变化 >12%）时回到 fitScale（"刚好装下"）；
  同方向下的细微变化仍只做"不小于 fit"的兜底，不重置用户捏合出来的缩放。

顺带修 DPR：原来按**当前** fitScale 算有效 DPR —— 竖屏启动会得到 3×0.2708 ≈ 0.81，
之后转横屏就欠采样、画面发糊。改成按**横屏等价**的 fit 算：
    min(长边/1440, 短边/820)
这样无论从哪个方向启动，两种方向都清晰（上限仍为 2）。

实测（390×844 ↔ 844×390 来回两轮，共 5 步）：
  竖屏启动  board 390×222  scale 0.270833  prefs 356~364 ✓  menu 368~386 ✓
  转横屏    board 685×390  scale 0.475610  prefs 704~718 ✓  menu 725~757 ✓
  转回竖屏  board 390×222  scale 0.270833 ✓（修复前会停在 0.4756 → 右侧被切）prefs/menu 均在屏内 ✓
  再转横屏 / 再回竖屏 同样"刚好装下" ✓；错误 0
MSG
echo "已提交："; git log --oneline -1
