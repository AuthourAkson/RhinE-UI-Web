#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修复右上角时钟冒号与数字重叠：CalcTextWidth 的 fromZero 要的是步进宽度，不是墨迹外框

症状（用户实测）：顶栏右上角的时间里，冒号和数字挤在一起。

成因：主题的带字距标签是**逐字形**画的（lib/text.js:53-62）——
    adv = gr.CalcTextWidth(ch, f, true)   ← 每个字形的"步进宽度"
    g.DrawText(ch, f, colour, cx, 0, adv + dp(4), h, DT_GLYPH)
    cx += adv + gap                        ← 用 adv 推进画笔
而 shim 把 fromZero=true 实现成"墨迹外框"：
    return fromZero ? (actualBoundingBoxLeft + actualBoundingBoxRight || width) : width;
等宽字体里每个字的步进相同（15px 下都是 9px），但"冒号"的墨迹只有 2~3px →
画笔推进不足 → 后面的数字压到冒号上。同一个标志还被 archive.js 用来算等宽数字格
（CalcTextWidth("0", f, true)，共 4 处），所以这不是只影响时钟的局部问题。

修复：
· CalcTextWidth 一律返回 ctx.measureText().width（步进宽度）；
  实测 "18:17:56" 逐字步进 = 9,9,9,9,9,9,9,9（合计 72 = 8×9），此前冒号那一格是 ~3
· 顺带去掉 DrawText 里 fillText/strokeText 的 maxWidth 参数：它会把整行字**横向压缩**
  （Direct2D 是裁掉/省略，不是压扁），窄列下会挤成一团；省略号仍由 DT_ELLIPSIS 分支处理

验证：
· 时钟区域放大 3 倍截图：18 : 36 : 31 冒号与数字完全分离，日期行 SUN · 11 OCT 2026 字距均匀
· 五视图回归：全部出图、零报错；PLAY ALBUM 播放正常（bombinsound）
MSG
echo "已提交："; git log --oneline -1
