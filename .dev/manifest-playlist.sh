#!/usr/bin/env bash
# 检查清单里 playlist 面板的脚本顺序是否解析出来（用项目内临时文件，避免 /tmp 路径映射问题）
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
curl -s http://127.0.0.1:8300/__manifest.json > .dev/mf.json
node -e '
const m = JSON.parse(require("fs").readFileSync(".dev/mf.json", "utf8"));
console.log("scripts 键:", Object.keys(m.scripts).join(" "));
console.log("playlist 顺序:");
for (const f of (m.scripts.playlist || [])) console.log("   " + f);
console.log("native/playlist.js 在清单文本里:", Object.prototype.hasOwnProperty.call(m.text, "native/playlist.js") ? "✓" : "✗");
'
