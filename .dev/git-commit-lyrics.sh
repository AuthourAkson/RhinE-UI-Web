#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 确认音乐文件没有被 git 跟踪（版权）==="
git status --short | grep -i musiclab || echo "  （没有 musiclab 相关改动被跟踪 ✓）"
git add -A
git commit -q -F - <<'MSG'
默认曲库改为 musiclab/，并接通歌词：同名 .lrc 文件

一、测试音乐默认来源
· /__music.json 现在优先扫仓库根下的 musiclab/（没有才退回 .dev/music）
· 曲目 path 改为**真实绝对路径**（D:\…\musiclab\x.mp3），不再伪造 C:\Music\…
  —— 主题的歌词/封面是"按音频路径推同名文件"找的（lib/lyrics.js:57 换后缀取 .lrc），
     伪造路径永远推不出仓库里真实存在的 .lrc
· 清单新增 root，并把 .lrc / .srt 当文本收录（TEXT_EXT）
· shim 的 norm() 会剥掉项目根前缀，于是主题按绝对路径问 IsFile/ReadTextFile 时
  能命中清单里 root 相对的键（musiclab/x.lrc）
· musiclab/ 与 .dev/music/ 一样进 .gitignore（含商业曲目）；启动器判断 demo 时两者都认

二、随路径改动暴露并修掉的两个真 bug
1. 03 LYRICS 中间画出一整块 SYSTEM WARNING · FILE NOT FOUND / DECODER · NO INPUT。
   成因：主题 `T.missing = /^[a-z]:\\/i.test(path) && !utils.IsFile(path)`
   （lib/nowplaying.js:40），而 shim 的 IsFile 只查 text/images 两类清单 ——
   音频这类二进制只在 MANIFEST.files 里，于是真实存在的曲目被判成"文件不存在"。
   现在 IsFile 也查完整文件清单（Set 缓存，O(1)）。
2. 卡片显示 BITRATE 320,000。foobar2000 的 TitleFormat `%bitrate%` 单位是 kbps
   （320 → "320"），file-info 的 bitrate 字段才是 bps；之前统一乘了 1000。
   现在 fieldsOf() 给 kbps，makeFileInfo() 的 Info* 保持 bps。

三、歌词（同名 .lrc）实测
  T.lyrics = { source: "LRC", lines: 130, synced: true }
  03 LYRICS：中间同步高亮当前行（00:05.49 对应的 "And let's begin"）、
  顶部 chip "LRC · SYNCED"、底部 "LYRICS / LRC · LINE 06 OF 130"、
  左栏 "LYRICS: LRC · 1 LANGUAGE" + ANALYSIS 为 ACTIVE（不再是 FAULT）
  卡片 BITRATE 320 ✓、T.missing = false ✓

注：内嵌歌词标签（ID3 USLT / Vorbis LYRICS）还没有从标签解析器里提取；
在线 LRCLIB 那条（utils.DownloadFileAsync + on_download_file_done）也还没接。
MSG
echo "已提交："; git log --oneline -1
echo "=== 本次改动文件 ==="; git show --stat --oneline HEAD | head -12
