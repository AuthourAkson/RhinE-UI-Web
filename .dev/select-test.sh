#!/usr/bin/env bash
# 精确点击货架上的外壳（用主题的命中四边形质心），验证选中是否切换
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
P='D:\AgentTestLab\RhinE-UI\.dev\sel-probe.js'

echo "--- 点击前 ---"
node cdp.js eval - "$P"
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\sel-before.png' >/dev/null

echo ""
echo "=== 点第一张（quad0 质心 454,493）==="
node cdp.js clickxy - 454 493
sleep 3
node cdp.js eval - "$P"
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\sel-after1.png' >/dev/null

echo ""
echo "=== 再点左边那张（quad 靠左的一处 420,470）==="
node cdp.js clickxy - 420 470
sleep 3
node cdp.js eval - "$P"
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\sel-after2.png' >/dev/null
