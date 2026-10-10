#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never
echo "=== 本地 HEAD ==="
git rev-parse HEAD
echo
echo "=== 远端 main ==="
git ls-remote origin main
echo
echo "=== 远端各引用 ==="
git ls-remote origin
echo
echo "=== 本地与远端是否一致 ==="
L=$(git rev-parse HEAD); R=$(git ls-remote origin main | awk '{print $1}')
[ "$L" = "$R" ] && echo "✓ 一致（$L）" || echo "✗ 不一致：本地 $L / 远端 $R"
echo
echo "=== 远端分支上的文件数（用本地 origin/main 引用）==="
git ls-tree -r --name-only origin/main | wc -l
echo
echo "=== 远端顶层内容 ==="
git ls-tree --name-only origin/main
echo
echo "=== 工作区是否干净 ==="
git status --short | head -5
echo "(空 = 干净)"
