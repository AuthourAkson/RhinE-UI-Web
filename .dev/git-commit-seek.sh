#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修复进度条：fb.PlaybackTime 缺 setter，导致点击不跳转且拖动状态卡死

症状（用户实测）：点进度条时游标直接跟着鼠标左右跑，点击也不跳转。

成因：主题用**赋值**跳转（transport.js:361 `fb.PlaybackTime = drag.value`），
而 shim 只给了 getter。主题文件都是 "use strict"，对只有 getter 的属性赋值会抛
TypeError；更糟的是抛出点正好在 `drag = null` 之前，于是拖动状态永远结束不了 ——
之后每次鼠标移动都命中 on_mouse_move 里的 `if (drag)` 分支，游标就一直跟手，
跳转自然也没发生。这两个症状同源。

修复：
· shim 增加 set PlaybackTime → HOST.command('seek:…')
· 宿主实现 seek 命令：设置 audio.currentTime（夹在 [0, length-0.05]）、更新共享状态、
  触发 on_playback_seek（歌词/信号视图据此重新对齐）

一次修好主题里全部 5 处跳转：进度条释放、滚轮 ±5s（transport.js:380）、
点歌词行（stage.js:483）、点 signal 轨迹（stage.js:484）、方向键 ±5s（stage.js:494）。

验证（1707×899 @dpr1.5，3:32 的曲目）：
  点击 25% → 53.7s（期望 53.0）；点击 75% → 159.5s（期望 158.9）；
  点击 50% → 106.6s（期望 106.0）；每次操作后 drag=null ✓
  拖动：拖动中 127.1s → 松开后 currentTime=127.8s ✓，松开后再移动鼠标不再被拖走 ✓
MSG
echo "已提交："; git log --oneline -1
