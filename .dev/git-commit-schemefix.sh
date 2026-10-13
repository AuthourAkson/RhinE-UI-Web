#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修「非 archive 配色 + light 时 SIGNAL 中心环管线消失」：未加载完的图被缓存成空画布

用户实测：STYLE 页选 archive 以外的配色，切 light 模式，SIGNAL 中心的环管线整块消失。

复现与定位（逐组合量中心像素）：
  archive/light 8819 ✓   archive/dark 8587 ✓   flare/dark 8506 ✓
  flare/light  **499** ✗  ← 只有"非 archive + light"这一格坏
直接量主题那条链路：
  原图 ring              1400x900  不透明采样 4589/23774  平均亮度 38   ✓ 有内容
  accentShift(ring)      1400x900  不透明采样 **0**/53491  平均亮度 0   ✗ 全空
  手动 DrawEffect 结果    1400x900  不透明采样 **0**/53491  平均亮度 0   ✗ 全空

根因（两个缓存叠加，都不能改主题）：
  · shim 的 sourceCanvas() 为了性能把"把 <img> 画进 canvas"的结果缓存进 handle.__cv，
    但**没有检查图片是否已加载**。环的大 PNG（1400×900）还没 load 完时，
    某一帧 paint 就先调了 DrawEffect → 缓存下一张**空画布** → 之后永远返回空。
  · 主题 draw.js 的 accentShift() 拿到空源 → 生成全透明的"色相旋转副本"，
    并把它写进自己的 ACCENT_CACHE → 空白被**永久固化**。
  为什么只有"非 archive + light"：archive 配色 accentTurn()=0（不做旋转，直接用原图），
    所以只有换了配色才会走 accentShift() 这条路；light 又额外需要 day 精灵+阴影，触发更早。

修法：
  ① sourceCanvas()：图片未就绪时返回 null 且**不写缓存**，并按 __el 校验缓存归属
  ② DrawEffect()：源未就绪时**登记到该图片的 __onReady**，加载完成后把这一笔补画回去
     （补画时恢复当时的变换/透明度，并请求重绘把结果显示出来）——
     这样主题缓存里的那张副本会被"填上"内容，而不是留下永久空白。

验收：5 种配色 × light/dark 共 10 组，SIGNAL 中心像素全部正常（8310~10846，无低于 3000 的），
      控制台错误 0。
MSG
echo "已提交："; git log --oneline -1
