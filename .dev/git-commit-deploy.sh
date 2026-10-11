#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1

# .gitignore 是 GBK 编码（早先的 Windows 编辑器写的），不能整文件重写，
# 只用 ASCII 追加一行，保证既有字节不动。
grep -qx '/dist/' .gitignore || printf '\n# ---- \xe6\x9e\x84\xe5\xbb\xba\xe4\xba\xa7\xe7\x89\xa9\xef\xbc\x88 build-static.mjs \xe7\x94\x9f\xe6\x88\x90\xef\xbc\x89 ----\n/dist/\n' >> .gitignore
echo "=== dist 是否已被忽略 ==="
git check-ignore -v dist >/dev/null 2>&1 && echo "  已被忽略 ✓" || echo "  ✗ 仍未忽略"

git add -A
git commit -q -F - <<'MSG'
部署支持：build-static.mjs 生成 dist/ + Cloudflare Pages 配置；顺带修掉空曲库时永远"正在索引"

一、静态构建（新增 build-static.mjs）
   主题会**同步**读文本、**同步**问图片尺寸，浏览器里做不到，所以本地靠 serve.mjs 现算清单。
   静态站没有 Node 进程，只能把这一步放到构建期：dist/__manifest.json 就是那份清单。
   清单逻辑直接 import 自 serve.mjs（新增导出 + IS_MAIN 守卫，被 import 时不再监听端口），
   改一处两边同步，不会漂移。

   实测收益（未压缩）：
     dist                222.93 MB → 87.86 MB
     __manifest.json      7.31 MB → 1.69 MB（且 .dev 条目 0 个）
   两个大头：
     · assets/intro 是**预渲染开场影片**，10 个皮肤 × 145 张 JPEG = 144.6 MB ——
       主题 fx.js:73 自己就容错（皮肤没有自己的影片时回落到 SKIN_DEFAULT 那套），
       所以只发默认皮肤（从 themes/.../lib/skins.js 读出来，不写死）→ 省 132 MB。
       --intro-skin=all 可全发。
     · 清单原先内联了 .dev/manifest.json（3.1 MB，我自己调试留下的）和 ~200 个 .dev 探针脚本 ——
       构建时排除 .dev/ image/ musiclab/ 与本地启动脚本。
   同时产出 Pages 配置：
     _headers    /themes/* 一年 immutable（主题与原版逐字节一致，90% 体积在这）；
                 app.js/shim/native/workers/html/清单走 must-revalidate 吃 304
     _redirects  SPA 兜底（真实文件优先）
   还额外写一份带内容哈希的 __manifest.<hash>.json 便于将来做指纹缓存。

二、修掉部署阻塞的 UX 缺口（app.js + shim）
   全新访客（没有任何曲库）打开档案页只会看到 "INDEXING LIBRARY …" 永远转圈，
   连主题自带的「+ ADD MUSIC FOLDER」入口都不出现。原因：
   主题的 LIB.live 只在 worker 送来 catalog 时置真（lib/library.js:69），
   而 archive.js:762 的入口条件是 LIB.live && !LIB.filter —— 空曲库时这条路径不会自己发生。
   修法：无 ?demo 启动时宿主补一次空索引，并由 shim 新增 emptyCatalog() 按主题的消息格式
   喂一条 0 曲目的 catalog（gen 必须等于主题当前的 LIB.gen，否则 libMessage 第一行就 return）。
   结果：显示主题自己的 "没有专辑 · 媒体库和播放列表都是空的" + 「+ 添加音乐文件夹」，
   点它 → Library/Configure → shim 映射到宿主的 add-music → 目录选择器，链路完整。

验证（dist/ 用最小静态服务器托管，模拟线上：不做任何动态清单生成）
   · 面板全部渲染、**0 个控制台错误**，五视图逐一截图正常
   · 清单：text 89 个 / .dev 0 个 / files 925 个 / root=""
   · __manifest.json 单次 1690 KB（原 7310 KB）
   · 空曲库：主题侧 LIB.live=true，命中区 ar-addmusic(532,391,140×40) 存在，
     空态文案为 "没有专辑 · 媒体库和播放列表都是空的"
MSG
echo "已提交："; git log --oneline -1
echo; echo "=== 依赖注入到 dist 的脚本是否也进去了 ==="
git show --stat --oneline HEAD | tail -12
