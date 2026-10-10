#!/usr/bin/env bash
# 只对比 JS/JSON 源码差异（跳过 assets）
SRC='/d/AgentTestLab/RhinE-1.4.0-portable/foobar2000/profile/themes/audio-archive'
DST='/d/AgentTestLab/RhinE-UI/themes/audio-archive'

echo "=== JS/代码文件清单对比 ==="
(cd "$SRC" && find . -type f \( -name '*.js' -o -name '*.json' -o -name 'VERSION' \) | sort) > /tmp/src-files.txt
(cd "$DST" && find . -type f \( -name '*.js' -o -name '*.json' -o -name 'VERSION' \) | sort) > /tmp/dst-files.txt
diff /tmp/src-files.txt /tmp/dst-files.txt && echo "(文件清单完全一致)" || true
echo
echo "=== 逐文件 diff（只列出有差异的）==="
while read -r f; do
  if [ -f "$DST/$f" ]; then
    if ! diff -q "$SRC/$f" "$DST/$f" >/dev/null 2>&1; then
      n=$(diff "$SRC/$f" "$DST/$f" | grep -c '^[<>]')
      echo "差异: $f  ($n 行)"
    fi
  else
    echo "移植版缺失: $f"
  fi
done < /tmp/src-files.txt
echo
echo "=== 完全一致的文件数 ==="
same=0; diffn=0
while read -r f; do
  if [ -f "$DST/$f" ] && diff -q "$SRC/$f" "$DST/$f" >/dev/null 2>&1; then same=$((same+1)); else diffn=$((diffn+1)); fi
done < /tmp/src-files.txt
echo "一致: $same  差异/缺失: $diffn"
