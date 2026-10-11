#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
上线 rhine.auak.dpdns.org（Cloudflare Workers 纯静态）+ 修空曲库永远"正在索引"

一、部署（按 free-domain-worker-deploy skill 的流程，凭据复用它的 .secrets）
   · worker/wrangler.toml：**只有 [assets]、没有 main**。官方文档写得很清楚
     （workers/static-assets/billing-and-limitations）：
       "Requests to static assets are free and unlimited."
       "When using run_worker_first … will always invoke your Worker script. If you exceed
        your free tier request limits, these requests will receive a 429 instead of falling
        back to static asset serving."
     → 不配 main、不用 run_worker_first = 每个请求都走静态资源：免费、不限量、不耗每日 10 万次额度。
       这正是"省 Cloudflare 额度"的最优解（此前担心的额度问题在纯静态 Worker 上不存在）。
   · not_found_handling = "404-page"：不存在的路径返回静态 404、不调用脚本 —— 扫描器零成本。
     故意不写 _redirects 的 SPA 兜底：本站没有客户端路由，缺文件就该是真 404，
     否则某个主题 JS 缺失会返回 HTML，报错莫名其妙。
   · _headers 实测在 Workers 静态资源上**生效**（网上说法不一，以实测为准）：
       /themes/.../GeistMono-Regular.ttf → public, max-age=31536000, immutable, cf-cache-status: HIT
       /__manifest.json                  → public, max-age=0, must-revalidate（靠 ETag 走 304）
   · .dev/deploy-cf.sh：build / dry / deploy / verify 四步，token 从 .secrets 读、不落盘；
     注意别用 `node -e "require('/d/…')"` 读 state —— Node 在 Windows 上把 /d/... 当相对路径
     解析成 D:\d\...（实测 ENOENT），改用 sed 抽字段。
   · 结果：924 个文件 84.5 MB 上传 38 s；清单 Brotli 后 **290 KB**（原 1690 KB）；线上 0 报错。

二、上线后发现并修掉：全新访客永远停在 "正在索引媒体库…"
   上一提交的"空曲库也宣告就绪"是 1.5 s 定时触发的，但面板就绪要好儿秒
   （线上实测 stage 7.3 s，root 更晚）—— 定时器跑的时候 shim 还没出现，公告发不出去。
   改为：① 1.2 s 先 libraryLoaded(0) 放行 worker 排队的索引请求；
        ② 1.5/3/6/10 s 多个时间点补发；
        ③ **每个面板 ready 事件里逐个补发**（兜底，最可靠）。
   线上复验：档案页显示 "没有专辑 · 媒体库和播放列表都是空的" + 「+ 添加音乐文件夹」，
   点它 → Library/Configure → 宿主的 add-music → 目录选择器（本地读音乐，不上传）。

三、博客挂载
   D:\DrawMusic\portal\index.html 加了第 4 张作品卡片，链到 https://rhine.auak.dpdns.org/ ；
   用项目自带的 build-public.mjs 重新组装并部署（Worker "drawmusic-gallery" →
   auak.dpdns.org / www.auak.dpdns.org），线上已确认门户含该链接。
   注意：改动留在 D:\DrawMusic 工作区（**未提交**那个仓库），需要时由你决定是否 commit。
MSG
echo "已提交："; git log --oneline -1
