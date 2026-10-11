#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
export GIT_TERMINAL_PROMPT=0
echo "=== 提交历史 ==="
git log --oneline
echo
echo "=== 工作区 ==="
if [ -z "$(git status --porcelain)" ]; then echo "干净（无未提交改动）"; else git status --short; fi
echo
echo "=== 已跟踪文件数 ==="
git ls-files | wc -l
echo
echo "=== 仓库内容体积（不含 .git）==="
git ls-files -z | xargs -0 stat -c %s 2>/dev/null | awk '{s+=$1} END {printf "%.1f MB\n", s/1048576}'
echo
echo "=== 分支跟踪 ==="
git branch -vv
