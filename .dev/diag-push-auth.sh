#!/usr/bin/env bash
# 把两件事分开测清楚：
#   ① 仓库是否公开（不带任何凭据能否读取）—— 这决定了上一次"鉴权测试"有没有意义
#   ② 推送（写入）在禁止交互时是否要求凭据 —— 这才是"要不要你点"的真正判据
cd /d/AgentTestLab/RhinE-UI || exit 1
export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never

echo "=== ① 完全不带凭据，读远端（公开仓库不需要鉴权）==="
out=$(timeout 45 git -c credential.helper= ls-remote https://github.com/AuthourAkson/RhinE-UI-Web.git -h refs/heads/main 2>&1); rc=$?
echo "$out" | head -2
echo "退出码 $rc  → $([ $rc -eq 0 ] && echo '仓库公开：上一次的"鉴权测试"其实没验证凭据 ✗' || echo '需要凭据')"

echo
echo "=== ② 推送（写入）在禁止交互时 ==="
out2=$(timeout 60 git push --dry-run origin main 2>&1); rc2=$?
printf '%s\n' "$out2" | head -4
echo "退出码 $rc2 → $([ $rc2 -eq 0 ] && echo '写入凭据可用：推送无需交互 ✓' || echo '写入需要一次交互式登录（凭据不能用于推送了）')"

echo
echo "=== ③ 凭据库里 github 条目的时间（看到底是哪一条）==="
cmdkey /list 2>/dev/null | tr -d '\r' | grep -i -A1 'git:https://github' | head -6
