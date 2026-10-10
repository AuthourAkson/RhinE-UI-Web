#!/usr/bin/env bash
# 画面稳定性检查：切到档案视图后隔 3 秒连拍三帧，比较是否一致
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\goto-archive.js' >/dev/null
sleep 6
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\stable-a.png' >/dev/null
sleep 3
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\stable-b.png' >/dev/null
sleep 3
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\stable-c.png' >/dev/null
cd /d/AgentTestLab/RhinE-UI/.dev || exit 1
echo "=== 三帧校验和（相同=画面稳定，说明没有持续重排/闪烁）==="
md5sum stable-a.png stable-b.png stable-c.png
echo ""
echo "=== 实时错误 ==="
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\loop-check.js'
