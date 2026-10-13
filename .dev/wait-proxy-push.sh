#!/usr/bin/env bash
# 守望代理恢复：一旦能出网就自动推送 + 部署（最多 12 次，间隔 45 秒 ≈ 9 分钟）
#
# ⚠️ 探测方式用 **git ls-remote**，不要用 curl：
#    这台机器上 curl 走 7897 会报 schannel TLS 握手失败 / 502（curl 自己的 TLS 栈问题），
#    而 git（OpenSSL）与 wrangler 走同一个代理是通的 —— 2026-10-12 就是因为用 curl 探测，
#    明明 git 已经能通却一直判定"代理没恢复"，白等了 9 分钟。
cd /d/AgentTestLab/RhinE-UI || exit 1
export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897
export GIT_TERMINAL_PROMPT=0
for i in $(seq 1 12); do
  if timeout 25 git ls-remote origin -h refs/heads/main > /dev/null 2>&1; then
    echo "[$(date +%H:%M:%S)] 第 $i 次探测：git 可达 ✓ 开始推送 + 部署"
    bash .dev/git-push-token.sh && bash .dev/deploy-retry.sh
    echo "完成：本地 $(git rev-parse --short HEAD) / 远端 $(git rev-parse --short origin/main)"
    exit 0
  fi
  echo "[$(date +%H:%M:%S)] 第 $i 次探测：git 不可达 ✗"
  sleep 45
done
echo "9 分钟内仍不可达 ✗（本地提交安全，等你说一声我再推）"
exit 1
