#!/usr/bin/env bash
# 重新部署博客门户（D:\DrawMusic\worker → Worker "drawmusic-gallery" → auak.dpdns.org）
# 只做两件事：跑项目自带的组装脚本 build-public.mjs，然后 wrangler deploy。
# 凭据同样从 free-domain-worker-deploy skill 的 .secrets 读，不落盘、不进 git。
set -u
SECRETS_DIR=${SECRETS_DIR:-/d/Skill实验室/.secrets}
WORKER_DIR=${WORKER_DIR:-/d/DrawMusic/worker}
PROXY=${PROXY:-http://127.0.0.1:7897}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n' < "$SECRETS_DIR/cf-token.txt")"
export CLOUDFLARE_ACCOUNT_ID="$(sed -n 's/.*"accountId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SECRETS_DIR/cf-state.json" | head -1)"
export HTTP_PROXY="$PROXY" HTTPS_PROXY="$PROXY"

cd "$WORKER_DIR" || { echo "找不到 $WORKER_DIR"; exit 1; }
echo "--- 1) 组装静态目录（门户 + draw + world + media）---"
node build-public.mjs || exit 1

echo "--- 2) wrangler deploy ---"
npx --yes wrangler@4 deploy || exit 1

echo "--- 3) 线上校验门户里是否已有 RhinE 卡片 ---"
sleep 10
HOST=auak.dpdns.org
for i in 1 2 3; do
  body=$(curl -s -x "$PROXY" --max-time 45 "https://$HOST/?_=$RANDOM")
  if printf '%s' "$body" | grep -q 'rhine.auak.dpdns.org'; then
    echo "  ✓ 门户已含 RhinE 卡片链接"
    printf '%s' "$body" | grep -o 'href="https://rhine[^"]*"' | head -2
    break
  fi
  echo "  第 $i 次没看到（边缘缓存更新中），再等 10s…"
  sleep 10
done
