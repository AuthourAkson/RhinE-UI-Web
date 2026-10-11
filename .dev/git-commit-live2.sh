#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
补：上线后的验证脚本与日志（博客卡片布局实测）

· .dev/blog-shot.mjs / blog-verify.mjs —— 抓博客首页 + 数值核对卡片布局
  （图片会被查看器缓存，所以用 getBoundingClientRect 的坐标当证据）
· .dev/live-check.mjs —— 线上站点真机验收（URL/标题/面板就绪/控制台错误/传输量/缓存头）
· .dev/deploy-portal.sh —— 重新部署博客门户（D:\DrawMusic\worker → drawmusic-gallery）
· 日志若干

实测：
· rhine.auak.dpdns.org 首访 0 报错、清单 290 KB（Brotli）、字体 immutable + cf-cache-status HIT
· 博客侧 4 张卡片同一行：x = 153 / 397 / 641 / 885，每张 228px
  （门户 .cards 的 minmax 从 255px 收到 220px —— 232px 时实测差 17px 会掉成 3+1）
MSG
echo "已提交："; git log --oneline -1
