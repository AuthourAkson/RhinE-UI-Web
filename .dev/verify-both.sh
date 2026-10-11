#!/usr/bin/env bash
# 双向回归验证：dpr=1.5（用户环境）与 dpr=1 都必须正确
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
node --check shim/shim.js && echo "shim 语法 OK" || exit 1
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1

echo
echo "############ ① dpr=1.5（模拟用户 150%），与原版参考同尺寸 ############"
cd /d/AgentTestLab/RhinE-UI || exit 1
node .dev/cmp-shot.mjs 2>&1 | tail -3
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\marker-compare.js'
echo
echo "---- 资料卡离屏层是否已按 DPR 放大 ----"
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\layer-check.js' | grep -A4 infoLayer
