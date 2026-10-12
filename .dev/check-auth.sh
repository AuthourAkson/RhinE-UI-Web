#!/usr/bin/env bash
# 判定"推送到底需不需要人工交互"：
#   GCM_INTERACTIVE=never 明确禁止凭据管理器弹任何界面 + GIT_TERMINAL_PROMPT=0 禁止终端提问。
#   在这两个前提下若能完成鉴权，就说明**完全不需要用户点击**。
cd /d/AgentTestLab/RhinE-UI || exit 1
export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never
echo "=== 只读鉴权测试（禁止任何交互）==="
t0=$(date +%s%N)
out=$(timeout 45 git ls-remote origin -h refs/heads/main 2>&1); rc=$?
t1=$(date +%s%N)
echo "$out"
echo "退出码 $rc   耗时 $(( (t1 - t0) / 1000000 )) ms"
if [ $rc -eq 0 ]; then
  echo "→ 结论：**完全不需要人工干预**，凭据是现成可用的 ✓"
else
  echo "→ 结论：这次确实需要交互或网络有问题（退出码 124=超时）"
fi
