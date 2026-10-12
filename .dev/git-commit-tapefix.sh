#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修磁带选中"突然变色"：Effect/DrawEffect 实现错了（把 D2D 颜色矩阵当成了色相滤镜）

用户实测：档案页点被遮住的磁带时，原版是"磁带逐渐虚化被选中"，我们这版却在中间**突然变色**。

根因：主题的"渐隐"是一套 **5×4 颜色矩阵**，而我的 shim 把它当成色相旋转、用 CSS hue-rotate 近似：
    // archive.js —— 把 frost 贴图按 f 向背景色淡出（0.1 一档），k = 1-f
    const fx = d2d.Effect("{921F03D6-641C-47DF-852D-B4BB6153AE11}");
    fx.SetValue(0, new Float32Array([k,0,0,0, 0,k,0,0, 0,0,k,0, 0,0,0,1, r*f,g*f,b*f,0]));
    gr.DrawEffect(fx, 0, 0, 0, 0, src.Width, src.Height);
  → 老的 Effect() 里 `hueFromMatrix(v)` 把矩阵算成角度、设成 hue-rotate 滤镜，
    而离屏渲染（CreateImage + GetGraphics）里那个滤镜根本没生效 →
    **10 个 f 档位渲染出来完全一样** → 过渡不是渐变，而是最后一帧直接切成 clear
    → 看着就是"磁带画面中间突然变色"。
  同一机制也用于配色方案的色相旋转（draw.js 的 hueMatrix），所以那条也一起不准。

修法：给图像句柄加 colourMatrix()，按 **D2D 的 5×4 语义**逐像素算（列 = 输入 R,G,B,A 与偏移，行 = 输出）：
    outR = m0*R + m4*G + m8*B  + m12*A + m16     （其余通道同理）
  DrawEffect 有矩阵就先用它算出贴图再画；Effect.SetValue(0, 20 个 float) 记下矩阵。
  结果按「源画布 + 矩阵」缓存（fx.js 的启动影片每帧都调 DrawEffect，不缓存会卡）。

实测：
  ① 主题自己的 tinted(frost, f) 平均亮度（修复前四档完全相同）
       f=0 → 47    f=0.5 → 24    f=1 → 0        ← 逐档向背景淡出 ✓
  ② 线上（rhine.auak.dpdns.org，清空存储当全新访客 + 载入内置音频库）：
       demo 按钮可见 → files=8/tracks=8；淡出档位 47 / 24 / 0 ✓；点击命中区 (471,503) ✓；
       控制台错误 0 ✓；画面里被选中的那盘是"清晰态"，另一盘仍是"蒙霜态" ✓
MSG
echo "已提交："; git log --oneline -1
