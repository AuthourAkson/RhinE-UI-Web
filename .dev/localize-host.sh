#!/usr/bin/env bash
# 把宿主里面向用户的 log() 文案改成走 ht()（英文原文即 key，缺翻译用英文）
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
python - <<'PY'
import io, re, sys
p = 'app.js'
s = io.open(p, encoding='utf-8').read()
subs = [
 ("log(`媒体库就绪：${fileCount} 个文件（来源 ${LIB.source}）→ 通知面板重新索引`)",
  "log(ht('Music library ready: {0} files (source {1}) → asking the panels to re-index', fileCount, LIB.source))"),
 ("log(`曲库解析完成：${m.tracks} 首 / ${LIB.albums.length} 张专辑（解析 ${Math.round(m.ms.index)} ms）`)",
  "log(ht('Library indexed: {0} tracks / {1} albums ({2} ms)', m.tracks, LIB.albums.length, Math.round(m.ms.index)))"),
 ("log(`HTTP 曲库：${list.length} 个文件`)", "log(ht('HTTP library: {0} files', list.length))"),
 ("log('加载演示曲库失败：' + e.message)", "log(ht('Loading the demo library failed: {0}', e.message))"),
 ("log(`播放：${LIB.tracks[i].title || LIB.tracks[i].path}`)",
  "log(ht('Playing: {0}', LIB.tracks[i].title || LIB.tracks[i].path))"),
 ("log(`播放失败：${e.message}（浏览器可能不支持该格式）`)",
  "log(ht('Playback failed: {0} (the browser may not support this format)', e.message))"),
 ("log('此浏览器不支持 File System Access API，请用 Chrome/Edge')",
  "log(ht('This browser has no File System Access API — use Chrome or Edge'))"),
 ("log('已取消选择目录')", "log(ht('Choosing a folder was cancelled'))"),
 ("log('正在扫描目录…')", "log(ht('Scanning the folder…'))"),
 ("log(`扫描完成：${files.length} 个音频文件`)", "log(ht('Scan finished: {0} audio files', files.length))"),
 ("log(`模式切换 → ${mode}`)", "log(ht('Mode switched → {0}', mode))"),
 ("log(`配色方案 → ${req.scheme}（${req.mode}）`)", "log(ht('Colour scheme → {0} ({1})', req.scheme, req.mode))"),
 ("log(on ? '拾取模式已开：点画面上任意位置（或按住 Alt 点击），结果会打印并复制到剪贴板' : '拾取模式已关')",
  "log(on ? ht('Pick mode on: click anywhere (or hold Alt and click); the result is printed and copied to the clipboard') : ht('Pick mode off'))"),
]
for a, b in subs:
    if a not in s:
        print('未找到（跳过）:', a[:48]); continue
    s = s.replace(a, b, 1)
io.open(p, 'w', encoding='utf-8').write(s)
print('替换完成')
PY
node --check app.js && echo "语法 OK"
grep -c "ht('" app.js
