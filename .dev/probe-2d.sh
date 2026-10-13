#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== Ring.mode / 2d 的切换点 ==="
grep -n 'Ring.mode\|"2d"\|=== .2d.\|mode2' themes/audio-archive/js/*.js themes/audio-archive/js/lib/*.js | head -14
echo
echo "=== ring.js 里 2d 分支的绘制调用 ==="
grep -nE 'Geometry|Path|AddLine|AddArc|AddBezier|FillGeometry|DrawGeometry|Stroke|DrawLine|FillSolidRect|DrawImage' themes/audio-archive/js/lib/ring.js | head -30
echo
echo "=== 整个主题里用到的 d2d/graphics API（找 shim 可能缺的）==="
grep -rhoE '\b(gr|g|g2)\.(CreatePathGeometry|PathGeometry|DrawGeometry|FillGeometry|AddLine|AddArc|AddBezier|AddRectangle|BeginFigure|EndFigure|Open|Close|StrokePath|DrawEllipse|FillEllipse|DrawRoundRect|FillRoundRect)\b' themes/audio-archive/js | sort | uniq -c | sort -rn | head -12
grep -rhoE 'd2d\.[A-Za-z]+' themes/audio-archive/js | sort -u | head -24
