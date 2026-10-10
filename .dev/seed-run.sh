#!/usr/bin/env bash
# 应用种子：重建清单 → 全新加载 → 验证参考状态 + 几何
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd /d/AgentTestLab/RhinE-UI || exit 1
node --check shim/shim.js && echo "shim 语法 OK" || exit 1

# 清 headless 浏览器的 localStorage 种子标记，模拟"用户旧浏览器"迁移路径
cd '/d/Skill实验室/tools' || exit 1
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\seed-wipe.js' >/dev/null 2>&1 || true

# 清单重建（新文件 audio-archive-settings.json 要进 text 清单）
curl -s 'http://127.0.0.1:8300/__rebuild' >/dev/null && echo "清单已重建"

node cdp.js nav - "http://127.0.0.1:8300/?demo=1&seed=1" >/dev/null
sleep 16
echo "=== 状态验证 ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\lib-keys.js'
echo
echo "=== 截图 ==="
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\seed-applied.png'
