#!/usr/bin/env bash
# 交互点击测试：真实鼠标事件点按钮，验证状态变化
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
PROBE='D:\AgentTestLab\RhinE-UI\.dev\click-probe.js'

echo "=== 重载 ==="
node cdp.js nav - "http://127.0.0.1:8300/?click=$(date +%s)"
sleep 13
echo "--- 改前 ---"
node cdp.js eval - "$PROBE" | grep -E 'rootView|rootMode|fxKind|recentErrors' 

echo ""
echo "=== 点 1：底栏 LIGHT（transport 面板） ==="
node cdp.js clickxy - 1468 838
sleep 3
node cdp.js eval - "$PROBE" | grep -E 'rootMode|panelModes|recentErrors'
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\click-light.png' >/dev/null

echo ""
echo "=== 点 2：底栏 DARK（切回去） ==="
node cdp.js clickxy - 1528 838
sleep 3
node cdp.js eval - "$PROBE" | grep -E 'rootMode|recentErrors'

echo ""
echo "=== 点 3：切到 STYLE 视图，点 PLAY INTRO ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\goto-style.js'
sleep 3
node cdp.js clickxy - 1268 105
sleep 3
node cdp.js eval - "$PROBE" | grep -E 'rootView|fxKind|recentErrors'
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\click-intro.png' >/dev/null

echo ""
echo "=== 点 4：顶栏 MENU（之前必崩） ==="
node cdp.js clickxy - 1520 38
sleep 2
node cdp.js eval - "$PROBE" | grep -E 'recentErrors'
echo "（MENU 点击完成）"
