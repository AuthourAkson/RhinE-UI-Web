#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1

echo "=== 恢复前的证据 ==="
file index.html
echo "--- 与 HEAD 的差异行数 ---"
git diff --stat -- index.html

echo
echo "=== 从 git 恢复（HEAD 里是完好的那一版）==="
git checkout -- index.html
file index.html
echo "--- 恢复后内容（第 24-31 行）---"
sed -n '24,31p' index.html

echo
echo "=== 用 sed 做 ASCII-only 替换（不会重新编码文件）==="
# 原来的隐藏按钮是内联 display:none，改成调用宿主统一的 hideHud()（会淡出）
sed -i 's|onclick="document.getElementById(.hud.).style.display=.none."|onclick="hideHud()"|' index.html
# 在 </div> 前加一行注释（纯 ASCII 之外只有中文，用 git 里的既有编码写入 —— 这里不写中文，避免编码问题）
grep -n 'hideHud\|hide-btn' index.html

echo
echo "=== 确认编码没被破坏（应仍是恢复后的同一种编码）==="
file index.html
git diff --stat -- index.html
