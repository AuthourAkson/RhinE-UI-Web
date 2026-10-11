#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
清晰度与流畅度：标签位图吸附设备像素网格 + 播放进度按帧推进

用户反馈两点：① 全屏/窗口化下"播放专辑 / 打开专辑"等关键字仍不够清晰；
② 播放条与 SIGNAL 视图的进度"1 秒才动一次"，原版是流畅跑的。

② 播放 1 秒一跳（根因明确）
   app.js 原先只有：
       audio.addEventListener('timeupdate', …只改 SHARED.transport.time，不触发重绘…);
       setInterval(() => emit('on_playback_time', …), 1000);      // ← 每秒才让面板重绘
   原版是 foobar2000 每秒回调一次，但主题自带动画时钟（lib/motion.js 的 Clock，
   每 8ms 一帧，播放时持续跑），每帧重绘并重读 fb.PlaybackTime，所以看起来是连续的。
   改成按 requestAnimationFrame 每帧写 SHARED.transport.time 并 emit('on_playback_time')；
   该事件在主题里只有 transport.js 一个订阅者（repaintRuler，很轻），每帧发是安全的。
   实测每 100ms 采样 fb.PlaybackTime：2.11 2.215 2.335 2.441 … 3.115（每次 +0.11，连续）。

① 关键字发虚（两条原因）
   a) 上一提交已修：d2d.Font 的 style 第 0 位是粗体不是斜体 —— 之前粗体全丢了。
   b) 本次：主题的标签是"先画进位图再整张贴回"，而它多数位置只 Math.round 到整数 CSS px；
      dpr = 1.5 时**奇数** CSS 坐标 × 1.5 落在半设备像素上 → 整张位图被重采样 → 笔画发虚。
      量化（同一标签、同一画布，统计中间灰占比，越高越糊）：
          偶数 CSS x=10 → 41.7%    奇数 CSS x=11 → 63.3%   （差 50%）
      修法：shim 的 d2d.DrawImage 在非旋转时把目标位置与尺寸吸附到 1/dpr 网格
      （最多移动 0.33 CSS px）。修复后同一标签画在 x=10 / 11 / 21 的统计完全一致，
      与位置无关 = 位图与画布设备像素一一对应。
      另外核对了画布后备分辨率：可见面板全部 = clientWidth × dpr，且全屏尺寸变化后
      同步重建（header 2561→3840 等），隐藏面板显示时会重新 size()。

验证：五视图回归全部出图、零报错；PLAY ALBUM 正常播放（bombinsound）。
MSG
echo "已提交："; git log --oneline -1
