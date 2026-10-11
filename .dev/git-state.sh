#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 本地提交（已就绪，只差网络）==="
git log --oneline -3
echo
echo "=== 与远端的关系 ==="
echo "本地 HEAD : $(git rev-parse --short HEAD)"
echo "远端 main : $(git ls-remote origin main 2>/dev/null | cut -c1-7 || echo '（代理不通，读不到）')"
echo
echo "=== 工作区 ==="
if [ -z "$(git status --porcelain)" ]; then echo "干净"; else git status --short | head -5; fi
