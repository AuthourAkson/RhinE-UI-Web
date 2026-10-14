#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
安全加固 A：/musiclab/* 明确 noindex（robots.txt + X-Robots-Tag，含 Range 分支透传）

起因：Cloudflare 7 天分析里发现 /musiclab/* 被一个日本 IP（103.62.49.138）把整套曲目抓了一遍，
且这些含第三方版权音频，不该被搜索引擎收录。（同一批数据还显示大量 .env/.git 凭据扫描 913/220 次，
但全部被 Cloudflare 托管规则挡成 403，**2xx = 0，无泄露**。）

A 做了三件事：
  1. 新增 robots.txt（进 dist 根）：Disallow /musiclab/、/__manifest.json、/panel*、/shim/、/themes/ 等，
     并对 SemrushBot/AhrefsBot/MJ12bot/DotBot 全站禁抓（这些爬虫对本站全是 404，纯浪费额度）。
  2. _headers 给 /musiclab/* 下发 `X-Robots-Tag: noindex, noarchive, nosnippet`（+ 1 小时缓存）。
  3. ⚠️ Worker 的 Range 分支以前自己拼响应头，会把上面那条 noindex **丢掉** ——
     而浏览器取音频几乎总是带 Range（实测 HTTP 206），等于没生效。现在透传 x-robots-tag。

线上验收：
  robots.txt            → HTTP 200 ✓
  普通 GET 音频         → 200  x-robots-tag=noindex, noarchive, nosnippet ✓
  Range bytes=0-1023    → 206  x-robots-tag=noindex, noarchive, nosnippet ✓
  功能回归（改动碰到音频路径，必须验）：线上载入曲库 8 文件 ✓ 播放中=true ✓ 曲长 209.7s ✓
    时间 8.91 → 12.93 在走 ✓ 控制台错误 0 ✓

注：noindex/robots 只对**合规**爬虫有效；恶意扫描器无视它，那部分靠 B（Cloudflare WAF 防盗链 + 限流）。
MSG
echo "已提交："; git log --oneline -1
