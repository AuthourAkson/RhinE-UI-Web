#!/usr/bin/env bash
# 分清三件事：① 本机有没有网络（国内站点直连）② 代理能不能出去（HTTP 目标）③ github/cf 是否可达
P=http://127.0.0.1:7897
t() { # $1=标签 $2=url $3=代理参数
  if [ -n "${3:-}" ]; then code=$(curl -s -o /dev/null -w '%{http_code}' $3 --max-time 12 "$2" 2>/dev/null); else code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$2" 2>/dev/null); fi
  printf '  %-28s %s\n' "$1" "${code:-000}"
}
echo "=== ① 直连（不走代理）==="
t "baidu.com（国内，判断本机网络）" https://www.baidu.com
t "example.com" http://example.com
echo "=== ② 经代理 ==="
t "example.com（纯 HTTP，判断代理出口）" http://example.com "-x $P"
t "cp.cloudflare.com/generate_204" http://cp.cloudflare.com/generate_204 "-x $P"
t "github.com" https://github.com "-x $P"
echo "=== ③ TLS 握手细节（github 经代理）==="
curl -sS -o /dev/null -x "$P" --max-time 15 https://github.com 2>&1 | head -3
