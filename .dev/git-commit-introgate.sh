#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
demo 按钮：开场影片播完才出现 + 文案改为「+ 载入默认音频库」

一、影片没结束就冒出来了
按钮画在**顶层文档**里，z-index 比 fx 那个 iframe 高 → 影片还在放就盖在上面（用户实测）。
主题 fx.js 的 endBoot() 本来就会 send("boot-end")，正好当信号：
 · 宿主 BUS.post 收到 boot-end → introDone = true
 · updateDemoBtn() 里：fx 面板可见且 introDone 还是 false（= 影片还在放）→ 不显示
 · 兜底：fx 面板被隐藏也算放完（万一影片素材缺失、boot-end 没发出来）
实测：t≈4s/6s（fx 可见）按钮 display:none ✓；t≈9s 起 fx 隐藏、按钮出现且文案已改 ✓

二、文案
「+ 载入默认音乐 Demo」→ **「+ 载入默认音频库」**（英文键同步改为 + LOAD DEFAULT AUDIO LIBRARY）

已部署到 rhine.auak.dpdns.org（2 个文件增量）。
MSG
echo "已提交："; git log --oneline -1
