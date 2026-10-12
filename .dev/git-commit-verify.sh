#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
补：demo 的线上验收脚本与收尾脚本

· .dev/live-demo.mjs         线上端到端：demo 按钮 → 载入 8 首 → 播放二创曲 → 拖动进度条（看 206）
· .dev/demo-test.mjs         本地 dist 版同一套流程
· .dev/two-buttons.mjs       截「+ 添加音乐文件夹 / + 载入默认音乐 Demo」两个按钮并放大核对位置
· .dev/stop-servers.sh       收尾：按监听端口停掉本机 8300/8310 的服务器，不做通杀
· .dev/serve-dist.mjs        补上 Range 实现（线上由 worker/src/worker.js 负责），本地才测得出拖动体验
· .dev/fs-lyrics*.mjs / light-check / hud-test / blog-* 等探测脚本

实测结论（见上一条提交的说明）：线上 demo 全流程通过、Range 206 生效、同名 .lrc 命中、0 报错。
MSG
echo "已提交："; git log --oneline -1
