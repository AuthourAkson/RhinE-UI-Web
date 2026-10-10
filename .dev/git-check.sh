#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== git 身份配置 ==="
git config --global user.name; git config --global user.email
echo
echo "=== 远端仓库是否已存在/有内容 ==="
export GIT_TERMINAL_PROMPT=0
git ls-remote https://github.com/AuthourAkson/RhinE-UI-Web.git 2>&1 | head -10
echo "(空 = 仓库存在但为空；报错 = 私有或不存在)"
echo
echo "=== gh CLI ==="
command -v gh >/dev/null 2>&1 && gh auth status 2>&1 | head -8 || echo "(未安装 gh)"
echo
echo "=== 凭据管理器 ==="
git config --global credential.helper || echo "(未配置 credential.helper)"
echo
echo "=== 文件总数 ==="
find . -type f -not -path './.dev/chrome-profile/*' | wc -l
echo
echo "=== 敏感信息扫描（token/密码）==="
grep -rInE 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|api[_-]?key\s*[:=]\s*["'"'"'][A-Za-z0-9]{16,}|password\s*[:=]' \
  --include='*.js' --include='*.mjs' --include='*.json' --include='*.html' --include='*.md' \
  . 2>/dev/null | grep -v 'chrome-profile' | head -10
echo "(空 = 没扫到)"
