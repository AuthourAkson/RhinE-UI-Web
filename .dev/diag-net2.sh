#!/usr/bin/env bash
# 代理刚开，细查一次：HTTP 代理 / SOCKS、以及实际错误
P=http://127.0.0.1:7897
echo "=== HTTP 代理方式 ==="
curl -sS -o /dev/null -w "  github: %{http_code} (%{time_total}s)\n" -x "$P" --max-time 25 https://github.com 2>&1 | head -4
echo "=== SOCKS5 方式（有些客户端是混合端口）==="
curl -sS -o /dev/null -w "  github: %{http_code} (%{time_total}s)\n" --socks5-hostname 127.0.0.1:7897 --max-time 25 https://github.com 2>&1 | head -4
echo "=== 代理端口连通性（TCP）==="
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/127.0.0.1/7897' && echo "  7897 TCP 可连 ✓" || echo "  7897 连不上 ✗"
echo "=== 直连 api.cloudflare.com ==="
curl -sS -o /dev/null -w "  api.cf: %{http_code} (%{time_total}s)\n" --max-time 25 https://api.cloudflare.com/client/v4/user/tokens/verify 2>&1 | head -4
