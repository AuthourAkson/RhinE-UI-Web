#!/usr/bin/env bash
# 探测可用的 GitHub 认证方式（不打印任何密钥内容）
echo "=== SSH 密钥 ==="
ls -1 ~/.ssh/ 2>/dev/null | grep -vE 'known_hosts|config' || echo "(无 ~/.ssh 内容)"
echo
echo "=== SSH 连 GitHub 测试 ==="
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=12 -T git@github.com 2>&1 | head -3
echo "(出现 'Hi 用户名' = SSH 可用)"
echo
echo "=== HTTPS 凭据管理器里是否有 github.com 凭据（只看数量，不打印内容）==="
export GCM_INTERACTIVE=never GIT_TERMINAL_PROMPT=0
n=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | grep -c '^password=')
echo "password 字段数: $n （0 = 没有存储凭据）"
echo
echo "=== 是否有 GCM 配置文件 ==="
ls -1 ~/.gitconfig 2>/dev/null && grep -A3 'credential' ~/.gitconfig 2>/dev/null | head -8
