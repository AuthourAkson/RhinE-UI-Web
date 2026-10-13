#!/usr/bin/env bash
# 换节点后重新定位：代理出口是否恢复？端口是否还是 7897？git 是否用了别的代理设置？
P=http://127.0.0.1:7897
echo "=== 端口监听 ==="
netstat -ano | grep -E ':789[0-9][[:space:]]' | grep LISTENING | head -6
echo "=== 代理出口 ==="
for u in http://example.com http://cp.cloudflare.com/generate_204 https://github.com https://api.cloudflare.com/client/v4/user/tokens/verify; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -x "$P" --max-time 15 "$u" 2>/dev/null)
  printf '  %-52s %s\n' "$u" "${code:-000}"
done
echo "=== 本机直连（对照）==="
printf '  %-52s %s\n' "https://www.baidu.com" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 https://www.baidu.com 2>/dev/null)"
echo "=== git 的代理相关配置 ==="
git config --global --get-regexp 'http\.|https\.|url\.' 2>/dev/null | head -8 || echo "  （无）"
echo "=== 环境变量里的代理 ==="
env | grep -iE '^(http_proxy|https_proxy|all_proxy|no_proxy)=' || echo "  （当前 shell 无）"
