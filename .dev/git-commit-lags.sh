#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修 demo 按钮切视图"延迟一下"：两个判断都错了（频道名 vs 消息 type、用 fx 可见性判断影片）

用户反馈：切离档案页时按钮慢一拍才消失，切回来也慢一拍才出现。

按 trace 定位到两处：
1) 开场影片结束的信号收不到
   主题的 send(type, data) 是 NotifyOthers(BUS, JSON.stringify({type, data}))：
   宿主拿到的 name 是**频道名**（audio-archive），type 在 info 的 JSON 里。
   我原先写 `if (name === 'boot-end') introDone = true` —— 拿频道名比 type，永远不成立，
   于是 introDone 一直是 false。
2) "影片还在放"判断方式根本不对
   原先用 `fx 面板 display !== 'none'`。实测影片放完后那个 iframe **依然是可见的透明浮层**，
   于是条件恒真、按钮被卡住 —— trace 显示切回档案后连续十几次都是 "fx影片中"，
   直到某个时点 fx 才变 none，按钮才出现（700ms 级延迟，正是用户看到的"延迟一下"）。
   改成直接读 fx.js 自己的状态：`boot.started && !boot.ended`（首次播放与 B 键重播都准）。

另外把消息钩子写对：name === 'audio-archive' 时解析 info 的 type，
   type 为 view / state 就立刻跟一串重试（20/60/120/240/480/900ms）更新按钮位置与可见性；
   兜底轮询从 400ms 放到 300ms（主路径已经是事件驱动）。
   顺便留了一个 window.__DEMO_DEBUG__ 计数（posts/chan/types/calls/why），
   下次这类"消息到底进没进宿主"的问题一眼可查 —— 这次就是靠它定位的。

实测（每 20ms 采样，比较"主题 ar-addmusic 命中区"与"demo 按钮"的出现时刻）：
   修复前：命中区 36ms / 按钮 713ms（差 677ms）
   修复后：命中区 75ms / 按钮 75ms（差 **0ms**）—— 与主题自己的入口同帧出现
   切走：20~40ms 内消失。
已部署到 rhine.auak.dpdns.org。
MSG
echo "已提交："; git log --oneline -1
