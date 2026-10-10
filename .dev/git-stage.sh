#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
set -e
if [ ! -d .git ]; then
  git init -b main >/dev/null
  echo "已初始化仓库（分支 main）"
fi
git config core.quotepath false
git config core.autocrlf false
git add -A
echo
echo "=== 暂存文件数 ==="
git diff --cached --name-only | wc -l
echo
echo "=== 确认已排除（应全部为空）==="
for p in '.dev/chrome-profile' '.dev/music' '.dev/manifest.json' 'tmp-gen'; do
  n=$(git diff --cached --name-only | grep -c "$p" || true)
  echo "  $p → $n 个文件${n:+ }"
done
echo
echo "=== 各目录暂存文件数 ==="
git diff --cached --name-only | awk -F/ '{print $1"/"$2}' | sed 's|/$||' | sort | uniq -c | sort -rn | head -12
echo
echo "=== 暂存内容总体积 ==="
git diff --cached --name-only -z | xargs -0 du -ch 2>/dev/null | tail -1
