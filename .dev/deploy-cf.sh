#!/usr/bin/env bash
# 部署 RhinE-UI 到 Cloudflare（纯静态 Worker），凭据复用 free-domain-worker-deploy skill 的 .secrets。
#
# 用法：
#   bash .dev/deploy-cf.sh build     只构建 dist/，不碰线上
#   bash .dev/deploy-cf.sh dry       构建 + wrangler dry-run（打印将上传的资源）
#   bash .dev/deploy-cf.sh deploy    构建 + 真正部署（会创建/更新 Worker 与自定义域名）
#   bash .dev/deploy-cf.sh verify    只看线上响应头（缓存策略是否生效）
#
# 环境变量（都有默认值，一般不用改）：
#   SECRETS_DIR  默认 /d/Skill实验室/.secrets         （cf-token.txt / cf-state.json）
#   WORKER_DIR   默认 <项目>/worker                    （wrangler.toml 所在）
#   ZONE_NAME    默认 auak.dpdns.org（从 state 读）
#   PROXY        默认 http://127.0.0.1:7897（npm/wrangler 走本机代理）
set -u
PROJ=/d/AgentTestLab/RhinE-UI
SECRETS_DIR=${SECRETS_DIR:-/d/Skill实验室/.secrets}
WORKER_DIR=${WORKER_DIR:-$PROJ/worker}
PROXY=${PROXY:-http://127.0.0.1:7897}
cd "$PROJ" || exit 1

step=${1:-build}

if [ "$step" = build ] || [ "$step" = dry ] || [ "$step" = deploy ]; then
  echo "--- 1) 生成 dist/ ---"
  node build-static.mjs || exit 1
fi

if [ "$step" = build ]; then
  echo "完成（未接触线上）"
  exit 0
fi

# --- 凭据：全部从 .secrets 读，绝不写进任何会被提交的文件 ---
if [ ! -f "$SECRETS_DIR/cf-token.txt" ]; then echo "缺少 $SECRETS_DIR/cf-token.txt"; exit 1; fi
export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n' < "$SECRETS_DIR/cf-token.txt")"
# ⚠️ 不要用 `node -e "require('/d/.../cf-state.json')"`：Node 在 Windows 上会把 /d/... 当成
#    相对路径解析成 D:\d\...（实测 ENOENT）。直接用 sed 抽字段，绕开路径风格问题。
ACCOUNT_ID=$(sed -n 's/.*"accountId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SECRETS_DIR/cf-state.json" | head -1)
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
export HTTP_PROXY="$PROXY" HTTPS_PROXY="$PROXY"
echo "账号: ${ACCOUNT_ID:0:8}…   域名: $(grep -m1 '^pattern' "$WORKER_DIR/wrangler.toml" | sed 's/.*"\(.*\)".*/\1/')"

cd "$WORKER_DIR" || exit 1

if [ "$step" = dry ]; then
  echo "--- 2) wrangler dry-run ---"
  npx --yes wrangler@4 deploy --dry-run --outdir /tmp/rhine-dryrun || exit 1
  echo "完成（dry-run，未上线）"
  exit 0
fi

if [ "$step" = deploy ]; then
  echo "--- 2) wrangler deploy ---"
  # 静态资源是内容寻址的：首次上传 80+ MB 若遇到网络抖动 fetch failed，直接重跑即可（只补缺失部分）
  npx --yes wrangler@4 deploy || { echo "首次失败，重试一次（内容寻址，只补缺失）…"; npx --yes wrangler@4 deploy || exit 1; }
  echo "--- 3) 完成，下面是验收 ---"
  step=verify
fi

if [ "$step" = verify ]; then
  HOST=$(grep -m1 '^pattern' "$WORKER_DIR/wrangler.toml" | sed 's/.*"\(.*\)".*/\1/')
  echo "--- 线上响应头（$HOST）---"
  # 国内递归解析器对新域名有负缓存 → 用 Cloudflare DoH 解析后再连（skill 的三条铁律之三）
  IP=$(curl -s "https://cloudflare-dns.com/dns-query?name=$HOST&type=A" -H 'accept: application/dns-json' \
        | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);const a=(j.Answer||[]).find(x=>x.type===1);process.stdout.write(a?a.data:'')}catch(e){}})")
  echo "解析: ${IP:-（A 记录还没出现，可能需要几分钟）}"
  for p in / /__manifest.json /themes/audio-archive/assets/fonts/GeistMono-Regular.ttf /app.js; do
    if [ -n "$IP" ]; then
      out=$(curl -s -o /dev/null -D - --resolve "$HOST:443:$IP" "https://$HOST$p" 2>/dev/null | tr -d '\r')
    else
      out=$(curl -s -o /dev/null -D - "https://$HOST$p" 2>/dev/null | tr -d '\r')
    fi
    code=$(printf '%s' "$out" | sed -n '1s/.* \([0-9]\{3\}\).*/\1/p')
    cc=$(printf '%s' "$out" | grep -i '^cache-control' | head -1 | cut -d' ' -f2-)
    cf=$(printf '%s' "$out" | grep -i '^cf-cache-status' | head -1 | cut -d' ' -f2-)
    printf '  %-58s %s  cache-control=%s  cf-cache-status=%s\n' "$p" "${code:-ERR}" "${cc:-（无）}" "${cf:-（无）}"
  done
  echo
  echo "期望：/themes/* 为 max-age=31536000, immutable（_headers 生效）；
       若显示 max-age=0, must-revalidate 说明 _headers 没被 Workers 静态资源读取 ——
       那就改成在 _headers 之外用 Cache Rules（或接受 304 校验，代价约每次访问几十 KB）。"
fi
