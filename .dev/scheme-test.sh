#!/usr/bin/env bash
# 配色方案切换测试：依次点击 5 个方案卡片，检查 SCHEME 是否跟着变
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
PROBE='D:\AgentTestLab\RhinE-UI\.dev\scheme-probe.js'

echo "=== 重载 + 切到 STYLE 视图 ==="
node cdp.js nav - "http://127.0.0.1:8300/?scheme=$(date +%s)"
sleep 13
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\goto-style.js'
sleep 3
node cdp.js eval - "$PROBE" | head -12

# 配色方案卡片：5 列，第一行在 y≈490，卡片宽约 155、间距约 13
i=0
for x in 118 293 466 639 812; do
  i=$((i+1))
  echo ""
  echo "--- 点击第 $i 张卡片 (x=$x, y=620) ---"
  node cdp.js clickxy - $x 620 >/dev/null
  sleep 4
  node cdp.js eval - "$PROBE" | grep -E 'rootScheme|rootMode|hud|recentErrors'
done
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\scheme-last.png' >/dev/null
echo ""
echo "已截图 scheme-last.png"
