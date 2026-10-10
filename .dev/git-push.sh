#!/usr/bin/env bash
# 推送到 GitHub（无交互：没凭据就快速失败，不弹窗挂住）
cd /d/AgentTestLab/RhinE-UI || exit 1
export GIT_TERMINAL_PROMPT=0
export GCM_INTERACTIVE=never
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/AuthourAkson/RhinE-UI-Web.git
echo "远端: $(git remote get-url origin)"
echo "分支: $(git branch --show-current)  提交: $(git rev-parse --short HEAD)"
echo "--- 开始推送 $(date +%H:%M:%S) ---"
git push -u origin main 2>&1
echo "--- 推送结束（退出码 $?）$(date +%H:%M:%S) ---"
