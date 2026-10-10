#!/usr/bin/env bash
# 把每个面板的画布内容导出成 PNG，看谁画了东西
set -u
export CDP_PORT=${CDP_PORT:-9226}
OUT=/d/AgentTestLab/RhinE-UI/.dev/canv
mkdir -p "$OUT"
cd '/d/Skill实验室/tools' || exit 1
for id in root stage header transport; do
  node cdp.js eval - "D:\\AgentTestLab\\RhinE-UI\\.dev\\canvas-dump.js $id" > "$OUT/$id.txt" 2>&1 || true
  head -c 120 "$OUT/$id.txt"; echo ""
done
echo ""
echo "=== 页面截图（对照）==="
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\ground-truth.png'
