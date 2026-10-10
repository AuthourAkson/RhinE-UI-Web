#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never
git add .dev/*.sh
git commit -q -m "dev: 补上传用的仓库检查/推送脚本"
git push origin main 2>&1 | tail -3
echo
echo "=== 最终状态 ==="
git log --oneline -2
echo "本地 HEAD: $(git rev-parse --short HEAD)  远端: $(git ls-remote origin main | cut -c1-7)"
echo "工作区: $(git status --porcelain | wc -l) 个未提交改动（0 = 干净）"
