#!/usr/bin/env bash
# 播放测试：点底栏播放键 → 看是否真的出声/走时间 → 主题侧状态是否跟着变
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1

echo "=== 重载（demo 曲库） ==="
node cdp.js nav - "http://127.0.0.1:8300/?demo=1&p=$(date +%s)"
sleep 15
echo "--- 播放前 ---"
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\play-probe.js' before

echo ""
echo "=== 点底栏播放键 (141,838) ==="
node cdp.js clickxy - 141 838
sleep 4
echo "--- 播放中 ---"
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\play-probe.js' playing

echo ""
echo "=== 再点一次（暂停） ==="
node cdp.js clickxy - 141 838
sleep 2
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\play-probe.js' paused
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\play-shot.png' >/dev/null
