#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 宿主的 BUS / 消息接收 ==="
grep -n "__RHINE_BUS__\|onMessage\|m.type" app.js | head -20
echo
echo "=== BUS 定义处 ==="
sed -n '/const BUS = /,/^};/p' app.js | head -30
