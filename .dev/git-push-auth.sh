#!/usr/bin/env bash
# 带交互的推送：Git Credential Manager 会弹窗或打印设备码，用户完成后继续推送
cd /d/AgentTestLab/RhinE-UI || exit 1
unset GIT_TERMINAL_PROMPT GCM_INTERACTIVE
git config --local credential.helper manager
echo "--- 开始推送（等待 GitHub 登录）$(date +%H:%M:%S) ---"
git push -u origin main 2>&1
echo "--- 推送结束（退出码 $?）$(date +%H:%M:%S) ---"
