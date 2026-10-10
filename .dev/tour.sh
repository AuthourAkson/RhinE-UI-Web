#!/usr/bin/env bash
# 全视图巡检：依次按 1-5 切视图，收集错误并各截一张图
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1

echo "=== 重新加载页面 ==="
node cdp.js nav - "http://127.0.0.1:8300/?v=$(date +%s)"
sleep 12
echo "=== 启动状态与错误 ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\probe1.js' | head -30

for pair in "0x31:archive" "0x32:playlists" "0x33:lyrics" "0x34:signal" "0x35:style"; do
  key="${pair%%:*}"; name="${pair##*:}"
  node cdp.js eval - "D:\AgentTestLab\RhinE-UI\.dev\switch-view.js" "$key" >/dev/null 2>&1
  sleep 3
  node cdp.js shot - "D:\\AgentTestLab\\RhinE-UI\\.dev\\view-$name.png" >/dev/null 2>&1
  echo "  已切到 $name 并截图"
done
echo "=== 结束后的错误汇总 ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\probe-errors.js'
