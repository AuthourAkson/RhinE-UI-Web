#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修选中磁带的"渐变"：DrawImage 的 alpha 量纲错了（0..255 被当成 0..1）

用户澄清：他指的是**选中那一刻的渐变** —— 现场是"先白色蒙霜，卡一下直接变成黑色(已解密)"。
上一提交（Effect 颜色矩阵）修的是另一条路径（行淡出的 tinted 贴图），渐变真正走的是 alpha 交叉淡入：

    // archive.js drawArrayCase，f === 0 时：
    const cl = clamp(it.c.clear.x, 0, 1);                                 // 连续的弹簧值
    if (cl < .99) gr.DrawImage(I.frost, …, Math.round(alpha * (1 - cl))); // frost 按 1-cl 淡出
    if (cl > .01) gr.DrawImage(I.clear, …, Math.round(alpha * cl));       // clear 按 cl 淡入
    // 同一函数里 alpha 的用法：withAlpha(C.well, alpha / 255)
    // 主题自己的助手：function quadImage(gr, img, q, ox, oy, k, alpha = 255)
  → 量纲是 **0..255**（默认值 255 就是铁证）。
  而我的 shim 写的是 `clamp(alpha, 0, 1)` —— 任何 ≥1 的值都被夹成 1（全不透明）→
  过渡中间 frost 和 clear **同时完全不透明** → clear 直接盖住 frost：
  表现就是"蒙霜 → 卡一下 → 直接变黑"，中间没有任何插值。

修法：
    const a = Number(alpha) || 0;
    ctx.globalAlpha = prevAlpha * (a > 1.001 ? clamp(a / 255, 0, 1) : clamp(a, 0, 1));
  兼容两种调用（主题的 0..255 与可能的 0..1）；顺便把所有用 alpha 的地方（外壳/导轨/封面/地面/行淡出）
  一起修准了。

实测（点击磁带后，每 55ms 采样磁带窗口平均亮度，看是否逐帧插值）：
  本地：42 → 41 → 41 → 42 → 75 → 113 → 116 → 117 → 114 → 111 → 110 → 106 → 92 → 47 → 31 → 36
  线上：42 → 41 → 41 → 57 → 107 → 117 → 116 → 117 → 115 → 113 → 110 → 78 → 47 → 36 → 35 → 32
  不同取值个数：**14**（修复前只有端点两个值 → 突变）；线上控制台错误 0。
MSG
echo "已提交："; git log --oneline -1
