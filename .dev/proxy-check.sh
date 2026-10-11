#!/usr/bin/env bash
echo "=== git 代理配置 ==="
git config --global --get http.proxy; git config --global --get https.proxy
git config --get http.proxy; git config --get https.proxy
echo "(以上为空 = git 未单独配置代理)"
echo
echo "=== 环境变量代理 ==="
env | grep -iE '^(http_proxy|https_proxy|all_proxy|no_proxy)=' || echo "(无)"
echo
echo "=== 7897 端口是否在监听 ==="
(curl -s -m 3 -o /dev/null -w 'proxy 7897: HTTP %{http_code}\n' -x http://127.0.0.1:7897 https://github.com 2>&1) || echo "proxy 7897: 连不上"
echo
echo "=== 直连 github 是否可用 ==="
curl -s -m 8 -o /dev/null -w 'direct github: HTTP %{http_code}\n' https://github.com 2>&1 || echo "direct github: 连不上"
echo
echo "=== 直连 git 协议测试 ==="
GIT_TERMINAL_PROMPT=0 timeout 20 git ls-remote https://github.com/AuthourAkson/RhinE-UI-Web.git 2>&1 | head -3
