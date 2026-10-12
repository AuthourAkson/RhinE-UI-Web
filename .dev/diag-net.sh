#!/usr/bin/env bash
# 分清"代理挂了"还是"只有 Cloudflare 连不上"
P=http://127.0.0.1:7897
for u in https://github.com https://cloudflare.com https://api.cloudflare.com/client/v4/user/tokens/verify; do
  a=$(curl -s -o /dev/null -w "%{http_code}" -x "$P" --max-time 15 "$u" 2>/dev/null)
  b=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$u" 2>/dev/null)
  printf '  %-52s 代理:%s  直连:%s\n' "$u" "${a:-000}" "${b:-000}"
done
echo
echo "=== 代理端口是否在监听 ==="
netstat -ano | grep -E ':7897[[:space:]]' | grep LISTENING || echo "  7897 没有监听 ✗（代理没开）"
