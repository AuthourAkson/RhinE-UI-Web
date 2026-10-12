#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修 SIGNAL 浅色模式中心整块空白：补上 shim 缺失的 Image.Resize / StackBlur / Clone

用户实测：SIGNAL 视图里 dark→light 后，中心（频谱 + 环管线）整块消失，切回 dark 或重进视图才恢复。

抓到的现场（paint 异常）：
  [error] [paint] TypeError: s.Resize is not a function
      at ringLoad (themes/audio-archive/js/lib/ring.js:29:42)
      at ringDraw (…)
根因：主题在 light 模式（"day"）要给环形做一层柔和阴影 —— 半尺寸副本再模糊：
      const s = Ring.img.still, sh = s.Resize(Math.round(s.Width / 2), Math.round(s.Height / 2));
      sh.StackBlur(10);
  而我的 shim **一个都没实现**：Resize / StackBlur / Clone 三个全缺
  （主题对这些方法的用量：Resize 7 处、StackBlur 4 处、Clone 2 处）。
  → ringLoad() 抛 TypeError → 整帧 on_paint 被异常打断，而画布在画之前已清空 → 中心全空。
  为什么"第一次切能显示、之后才坏"：异常发生时 `Ring.img.mode` 已经写成了 "day"，
  若之后还有别的重绘（悬停、尺寸变化等）就会跳过抛出分支画出来；没有后续重绘时，
  画面就一直停在那一帧的空白，直到再次重绘（切回 dark / 重进视图）。

修法：给图像句柄加这三个方法（语义按原版 SMP/D2D 的 Image）：
  Resize(w,h)  返回**新图**，内容缩放到新尺寸（带 DPR 后备，保持清晰）
  StackBlur(r) 就地模糊（canvas filter 近似，radius≈2σ 取一半）
  Clone()      返回副本
统一走 makeImageHandle()（与 CreateImage 同形状：能被 DrawImage 当源、能 GetGraphics 继续画），
同时挂到「已加载的图片句柄」（imageFor）和「离屏层」（CreateImage）上。

验证（连切 3 轮 dark↔light，量画布"非背景像素"）：
  dark 起始 10185；light 第 1/2/3 次 **10504 / 10504 / 10504**（完全稳定）；
  dark 第 1/2/3 次 10220 / 10220 / 10220；环阴影 Ring.img.shadow 存在（700x450, mode=day）；
  paint 相关异常 **0**（修复前每次切 light 都报 s.Resize is not a function）。

注：本次部署/推送时本机代理 127.0.0.1:7897 未运行（Cloudflare 与 GitHub 都连不上），
    先本地提交；代理恢复后再 deploy + push。
MSG
echo "已提交（本地）："; git log --oneline -1
echo; echo "未推送（代理未开）：本地领先远端 " ; git rev-list --count origin/main..HEAD 2>/dev/null || echo "?"
