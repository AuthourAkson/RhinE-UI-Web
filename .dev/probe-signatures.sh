#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 主题实际调用签名（各矢量 API）==="
for api in DrawLines DrawLine DrawEllipse FillEllipse DrawPolygon FillPolygon DrawRect FillSolidRect DrawRoundRect FillRoundRect; do
  echo "--- $api ---"
  grep -rhoE "\.$api\([^;]{0,90}" themes/audio-archive/js | sed 's/^\./  ./' | head -2
done
echo
echo "=== shim 里这些函数的声明 ==="
grep -nE '^      (DrawLines|DrawLine|DrawEllipse|FillEllipse|DrawPolygon|FillPolygon|DrawRect|FillSolidRect|DrawRoundRect|FillRoundRect)\(' shim/shim.js
