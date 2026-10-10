#!/usr/bin/env bash
# 检查 RhinE-UI 服务器与清单
cd "$(dirname "$0")/.." || exit 1
B=http://127.0.0.1:8300
for u in / /panel.html /shim/shim.js /themes/audio-archive/js/frame.js; do
  printf '  %-46s HTTP %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' $B$u)"
done
echo "  --- 清单摘要 ---"
curl -s $B/__manifest.json -o .dev/manifest.json
node -e '
const m = JSON.parse(require("fs").readFileSync(".dev/manifest.json","utf8"));
console.log("  文本文件:", Object.keys(m.text).length, "| 图片尺寸:", Object.keys(m.images).length, "| 文件总数:", m.files.length, "| 体积:", (m.bytes/1048576).toFixed(1), "MB");
console.log("  tokens.json 已内联:", !!m.text["themes/audio-archive/tokens/tokens.json"]);
console.log("  frame.js 已内联:", !!m.text["themes/audio-archive/js/frame.js"]);
for (const [k,v] of Object.entries(m.images).slice(0,3)) console.log("   图片尺寸样例:", k, v.w+"x"+v.h);
const tok = JSON.parse(m.text["themes/audio-archive/tokens/tokens.json"]);
console.log("  schemes:", Object.keys(tok.schemes).join(", "));
console.log("  archive/dark/bg:", tok.schemes.archive.dark.bg);
console.log("  metrics:", JSON.stringify(tok.metrics));
'
