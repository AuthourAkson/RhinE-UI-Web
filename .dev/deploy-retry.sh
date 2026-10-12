#!/usr/bin/env bash
# 部署重试：Cloudflare 这条链路本机时通时断，最多试 5 次（静态资源内容寻址，重跑只补缺失）
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
SECRETS_DIR=/d/Skill实验室/.secrets
export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n' < "$SECRETS_DIR/cf-token.txt")"
export CLOUDFLARE_ACCOUNT_ID="$(sed -n 's/.*"accountId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SECRETS_DIR/cf-state.json" | head -1)"
export HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897
node build-static.mjs > /dev/null 2>&1
cd worker || exit 1
for i in 1 2 3 4 5; do
  echo "--- 第 $i 次尝试 ---"
  out=$(npx --yes wrangler@4 deploy 2>&1)
  if printf '%s' "$out" | grep -q 'Deployed rhine-ui triggers'; then
    printf '%s\n' "$out" | grep -E 'Success|Uploaded rhine-ui|Deployed rhine-ui|Version ID'
    echo "部署成功 ✓"
    exit 0
  fi
  printf '%s\n' "$out" | grep -E 'ERROR|fetch failed' | head -2
  sleep 8
done
echo "5 次都没成功 ✗"
exit 1
