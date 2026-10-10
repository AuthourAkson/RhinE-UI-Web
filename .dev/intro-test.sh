#!/usr/bin/env bash
# 重建清单 → 重载 → 触发开场动画 → 播放过程中连拍
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1

echo "=== 重建清单（新素材入库） ==="
curl -s http://127.0.0.1:8300/__rebuild
curl -s http://127.0.0.1:8300/__manifest.json -o /d/AgentTestLab/RhinE-UI/.dev/manifest.json
node -e '
const m = JSON.parse(require("fs").readFileSync("D:/AgentTestLab/RhinE-UI/.dev/manifest.json","utf8"));
console.log("  文本", Object.keys(m.text).length, "| 图片尺寸", Object.keys(m.images).length, "| 文件", m.files.length, "|", (m.bytes/1048576).toFixed(1), "MB");
console.log("  开场帧已入库:", !!m.images["themes/audio-archive/assets/intro/white/frame-001.jpg"]);
'

echo "=== 重载页面 ==="
node cdp.js nav - "http://127.0.0.1:8300/?intro=$(date +%s)"
sleep 12

echo "=== 触发开场动画（主题快捷键 B） ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\trigger-intro.js'
sleep 2
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\intro-1.png'
sleep 1.5
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\intro-2.png'
sleep 1.5
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\intro-3.png'
sleep 4
node cdp.js shot - 'D:\AgentTestLab\RhinE-UI\.dev\intro-4.png'
echo "=== 播放后的错误 ==="
node cdp.js eval - 'D:\AgentTestLab\RhinE-UI\.dev\probe-errors.js'
