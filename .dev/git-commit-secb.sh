#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
安全加固 B：/musiclab/* 防盗链 + 扩充 AI 爬虫黑名单（已在线上生效并验证）

前提：用户给 token 补了 Zone WAF: Edit / Firewall Services: Edit 后，由
      .dev/cf-apply-b.mjs 通过 API 写入（先读出现有规则再追加，可 --rollback 撤销）。

写入结果（读回确认，自定义规则 3 → 4 条）：
  1. 新增：rhine: block /musiclab hotlinking from other sites
       (starts_with(http.request.uri.path, "/musiclab/")) and (http.referer ne "")
         and not (http.referer contains "auak.dpdns.org")
  2. 扩充原有 "AI Crawl Control"：以前只挡 GPTBot → 现在挡 GPTBot/CCBot/Bytespider/ClaudeBot/
     anthropic-ai/Amazonbot/Diffbot/ImagesiftBot/Omgili/cohere-ai/GoogleOther/PetalBot/
     SemrushBot/AhrefsBot/MJ12bot/DotBot；**刻意保留** ChatGPT-User / OAI-SearchBot /
     PerplexityBot 这类"带访客来"的。

⚠️ 踩坑记录（免得下次再撞）：
  · 免费版**不允许 `matches`（正则）运算符** —— 报 "not entitled: the use of operator Matches is
    not allowed, a Business plan or a WAF Advanced plan is required"。改用 starts_with/contains/ne。
  · 免费版**速率限制只有 1 条名额**，已被既有的 api-throttle（/api/*）占用 → **不新增限流规则**；
    而且 40 次/分钟对"每个文件只抓一次"的爬虫无效（抓完 8 个文件才 8 次请求）。
    配额实测：/musiclab/* 7 天 61 次请求 vs 免费 10 万/天 = 0.06%，本来就不需要限流。

线上行为验证（直连，四种 Referer）：
  其他网站引用 evil-scraper.example → **403 已挡** ✓      google.com → **403 已挡** ✓
  无 Referer 直接访问            → **206 放行** ✓      本站应用同源 → **206 放行** ✓
  门户页 auak.dpdns.org 引用     → **206 放行** ✓
应用零影响：/ 200 ✓  /panel 200 ✓  /panel.html 307 ✓  /shim/shim.js 200 ✓  /app.js 200 ✓
  主题 JS 200 ✓  __manifest.json 200 ✓  门户首页 200 ✓  门户 /api/list 200 ✓
功能回归：线上载入曲库 8 文件 ✓ 播放中=true ✓ 曲长 209.7s ✓ 时间 8.93→12.96 在走 ✓ 错误 0 ✓
MSG
echo "已提交："; git log --oneline -1
