#!/usr/bin/env bash
# 关键判断：如果你开的是 TUN/系统级代理，那么**不走 7897**反而能通。
# 这里分别测「不用代理」「用 7897」，并直接试着 git 连一次远端。
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 不走任何代理（TUN/系统代理模式下应该能通）==="
unset HTTPS_PROXY HTTP_PROXY ALL_PROXY
for u in https://api.cloudflare.com/client/v4/user/tokens/verify https://github.com https://www.google.com; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$u" 2>/dev/null)
  printf '  %-56s %s\n' "$u" "${code:-000}"
done
echo
echo "=== git 直连（不设代理环境变量）==="
GIT_TERMINAL_PROMPT=0 timeout 40 git ls-remote https://github.com/AuthourAkson/RhinE-UI-Web.git -h refs/heads/main 2>&1 | head -3
echo "  退出码 $?"
echo
echo "=== 对照：走 7897 ==="
for u in https://api.cloudflare.com/client/v4/user/tokens/verify https://github.com; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -x http://127.0.0.1:7897 --max-time 12 "$u" 2>/dev/null)
  printf '  %-56s %s\n' "$u" "${code:-000}"
done
