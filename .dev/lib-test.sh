#!/usr/bin/env bash
# 媒体库端到端测试：?demo=1 走 HTTP 曲库（.dev/music 的测试素材），看档案视图是否出专辑
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1

echo "=== 重建清单并重载（带 demo 参数） ==="
curl -s http://127.0.0.1:8300/__rebuild >/dev/null
node cdp.js nav - "http://127.0.0.1:8300/?demo=1&t=$(date +%s)"
sleep 16

echo "=== 曲库状态 ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\lib-probe.js'
echo ""
echo "=== 截图（档案视图） ==="
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\lib-archive.png'
