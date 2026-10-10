#!/usr/bin/env bash
# 检查体量：最大文件 / themes 分布 / 超大文件
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 最大的 15 个文件（已排除 chrome-profile）==="
find . -type f -not -path './.dev/chrome-profile/*' -printf '%s\t%p\n' 2>/dev/null \
  | sort -rn | head -15 \
  | while IFS=$'\t' read -r sz p; do printf '%8.2f MB  %s\n' "$(echo "$sz/1048576" | bc -l)" "$p"; done
echo
echo "=== themes/audio-archive 各部分 ==="
du -sh themes/audio-archive/* 2>/dev/null | sort -h | tail -8
echo
echo "=== 超过 50MB 的文件 ==="
find . -type f -size +50M 2>/dev/null | head
echo "(空 = 无)"
echo
echo "=== 顶层文件大小 ==="
ls -la *.html *.js *.mjs *.json *.md 2>/dev/null
