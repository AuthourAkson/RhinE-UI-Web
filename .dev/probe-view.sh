#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 宿主里的 view 处理 ==="
grep -n "view" app.js | grep -iE "cmd|current|VIEW|switch" | head -14
echo
echo "=== loadHttpLibrary ==="
sed -n '/async function loadHttpLibrary/,/^}/p' app.js
echo
echo "=== 主题 archive.js 里 ADD MUSIC FOLDER 的命中区 ==="
grep -n 'ar-addmusic' themes/audio-archive/js/*.js
echo
echo "=== 主题 header.js 切视图时发什么 ==="
grep -n 'send("view"' themes/audio-archive/js/*.js | head -6
