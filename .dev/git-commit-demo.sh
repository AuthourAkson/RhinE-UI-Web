#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
内置 demo 曲库上线：musiclab 随站发布 + 档案页「载入默认音乐 Demo」按钮 + Range 支持

用户要求：把 musiclab 全部传上去当默认曲库；在档案页「+ 添加音乐文件夹」下方加一个载入
默认音乐 demo 的按钮，方便访客快速体验（他先自己试加载流畅度）。
额度问题已先核实并答复：Workers 静态资源请求**免费且不限量**，存储也不额外收费
（官方 workers/static-assets/billing-and-limitations），所以传这 10.85 MB 不吃额度。

一、构建（build-static.mjs）
 · musiclab/ 不再排除，随 dist 一起发布（--no-demo 可关）；dist 101.99 MB / 937 文件
 · 构建期生成 **dist/__music.json**（形状与本地 serve.mjs 的 /__music.json 完全一致，
   宿主 loadHttpLibrary() 原样能用），path 用 `D:\musiclab\<名字>`（**反斜杠**：
   主题的 albumDir()/albumKeyOf() 按 `\` 切分路径分组），url 逐段 encodeURIComponent
 · 清单的 root 从 '' 改成 **'D:/'**：shim 的 norm() 会剥掉 root 前缀，
   于是 `D:\musiclab\迷迭香…lrc` 归一化成 `musiclab/迷迭香…lrc` —— 正好命中清单里内联的歌词
   （主题的 themes/… 路径不以 D:/ 开头，不受影响）

二、Range（Workers 静态资源不处理 Range，音频会"拖不动进度条"，见 skill 的 H 节）
 · worker/wrangler.toml：加 main = src/worker.js + run_worker_first = ["/musiclab/*"]
   只有 demo 音频走 Worker 脚本（这部分计入每日 10 万次额度），其余请求仍由静态资源层
   直接返回 —— 依旧免费不限量
 · worker/src/worker.js：自己实现 Range —— 向资产服务要整份时**剥掉 Range 头**，
   切片后返回 206；**content-length 自己算**（资产服务常常不给这个头）

三、入口按钮（app.js）——主题 JS 必须与原版逐字节一致，不能改它加按钮，所以由宿主画
 · 轮询 stage 面板的 STATE.view 与 hits.get('ar-addmusic')，仅在"档案视图 + 空库空态"
   显示（与主题自己的入口同生共死），位置 = 主题 ADD 按钮下方 10px，
   颜色/字号取自主题 tokens（C.fg/C.bg/AR_ST.btn），深浅色自动一致
 · 点击 → loadHttpLibrary() → 载入 8 首内置曲目

四、顺带给二创版配了同名歌词
 musiclab 里新增 `迷迭香-world.execute (me) ;-Mili.lrc`（复制自 Mili 那份 3.8 KB）。
 原因：主题按"音频同目录同名 .lrc"找歌词，而二创版文件名与现有 .lrc 不同名 →
 Demo 里看不到歌词（用户说明这首正是用来展示 lrc 的）。等你有二创对应的歌词，直接替换这个文件即可。

线上实测（rhine.auak.dpdns.org）：
 · demo 按钮出现在「+ 添加音乐文件夹」下方 10px（532,464 → 532,514），文案「+ 载入默认音乐 Demo」
 · 点击后：files=8、主题 LIB.live=true / albums=2、状态行"曲库解析完成：8 首 / 2 张专辑（107 ms）"
 · 二创同名 .lrc：utils.IsFile=true、3849 字节、首行 [ar:Mili]
 · 拖动进度条：6.9s → 设 60s → 实际 63.02s ✓（响应 206 + accept-ranges: bytes）
 · 控制台 0 报错
MSG
echo "已提交："; git log --oneline -1
