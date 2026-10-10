#!/usr/bin/env bash
# 在 1.4.0 包的所有主题副本里找 arrayW / infoX / xr 的定义，对比版本差异
PKG='/d/AgentTestLab/RhinE-1.4.0-portable'
echo "=== 包里所有主题副本 ==="
find "$PKG" -maxdepth 4 -type d -name 'audio-archive*' 2>/dev/null
echo
for D in "$PKG/audio-archive-1.4.0" "$PKG/foobar2000/themes/audio-archive" "$PKG/foobar2000/profile/themes/audio-archive" "$PKG/foobar2000/profile/audio-archive-backup"; do
  if [ -d "$D" ]; then
    echo "=== $D ==="
    grep -rn "arrayW\s*=\|const arrayW\|xr = arrayW\|xr = infoX\|xr = W" "$D/js" 2>/dev/null | head -8
    echo "  VERSION: $(cat "$D/VERSION" 2>/dev/null || echo '(无)')"
    echo
  fi
done
echo "=== 移植版 ==="
grep -rn "const arrayW\|xr = arrayW" /d/AgentTestLab/RhinE-UI/themes/audio-archive/js | head -4
