#!/usr/bin/env bash
# 自动找出本机能用的代理端口：逐个测试常见端口（HTTP 与 SOCKS5），能出网的就是它
echo "=== 本机监听的候选端口 ==="
PORTS=$(netstat -ano 2>/dev/null | grep LISTENING | grep -oE '127\.0\.0\.1:[0-9]+|0\.0\.0\.0:[0-9]+' | grep -oE '[0-9]+$' | sort -un | grep -E '^(1080|1081|1087|2080|2334|4780|7078|7890|7891|7892|7893|7897|7898|8080|8081|8118|8889|9910|20171|33210|10808|10809|10810)$')
echo "  $PORTS"
echo
echo "=== 逐个测试（HTTP 代理 / SOCKS5）==="
GOOD=""
for p in $PORTS; do
  h=$(curl -s -o /dev/null -w '%{http_code}' -x "http://127.0.0.1:$p" --max-time 8 http://example.com 2>/dev/null)
  s=$(curl -s -o /dev/null -w '%{http_code}' --socks5-hostname "127.0.0.1:$p" --max-time 8 http://example.com 2>/dev/null)
  mark=""
  [ "$h" = "200" ] && { mark="$mark HTTP✓"; [ -z "$GOOD" ] && GOOD="http://127.0.0.1:$p"; }
  [ "$s" = "200" ] && { mark="$mark SOCKS✓"; [ -z "$GOOD" ] && GOOD="socks5h://127.0.0.1:$p"; }
  printf '  %-6s HTTP=%-4s SOCKS=%-4s%s\n' "$p" "${h:-000}" "${s:-000}" "$mark"
done
echo
if [ -n "$GOOD" ]; then
  echo "可用代理: $GOOD"
  echo "=== 用它测 github / cloudflare ==="
  for u in https://github.com https://api.cloudflare.com/client/v4/user/tokens/verify; do
    if printf '%s' "$GOOD" | grep -q socks; then
      code=$(curl -s -o /dev/null -w '%{http_code}' --socks5-hostname "${GOOD#socks5h://}" --max-time 15 "$u" 2>/dev/null)
    else
      code=$(curl -s -o /dev/null -w '%{http_code}' -x "$GOOD" --max-time 15 "$u" 2>/dev/null)
    fi
    printf '  %-52s %s\n' "$u" "${code:-000}"
  done
else
  echo "没有找到能出网的本地代理端口 ✗"
fi
