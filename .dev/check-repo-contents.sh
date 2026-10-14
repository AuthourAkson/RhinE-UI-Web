#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== musiclab（含商业录音）是否已在仓库里 ==="
git ls-files musiclab | head -12
echo "  合计: $(git ls-files musiclab | wc -l) 个文件"
echo
echo "=== 开场影片 ==="
echo "  white 帧数: $(git ls-files themes/audio-archive/assets/intro/white | wc -l)"
echo "  intro 全部: $(git ls-files themes/audio-archive/assets/intro | wc -l)"
echo
echo "=== render 素材 ==="
echo "  文件数: $(git ls-files themes/audio-archive/assets/render | wc -l)"
echo
echo "=== 仓库里最大的 10 个已跟踪文件 ==="
git ls-files -z | while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s\t%s\n' "$(stat -c%s "$f")" "$f"; done | sort -rn | head -10 | while IFS=$'\t' read -r s f; do awk -v s="$s" -v f="$f" 'BEGIN{printf "  %8.1f MB  %s\n", s/1048576, f}'; done
echo
echo "=== 远端仓库大小与最近提交 ==="
git count-objects -vH | grep -E 'size-pack|count'
git log --oneline -3
