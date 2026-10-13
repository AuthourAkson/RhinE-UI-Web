#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== shim 里这些 API 是否存在 ==="
for api in DrawLines DrawLine DrawEllipse FillEllipse StrokeStyle DrawPolygon FillPolygon DrawRect FillSolidRect FillGradRect; do
  n=$(grep -c "\b$api\s*(" shim/shim.js)
  printf '  %-14s %s\n' "$api" "$([ "$n" -gt 0 ] && echo "有（$n 处）✓" || echo "缺失 ✗")"
done
echo
echo "=== ring.js 2D 分支的完整代码（60-160 行）==="
sed -n '60,112p' themes/audio-archive/js/lib/ring.js
echo
echo "=== 主题里 DrawLines 的调用签名 ==="
grep -rhoE 'DrawLines\([^)]*\)' themes/audio-archive/js | head -6
