#!/usr/bin/env bash
# 检查依赖图解析结果
cd "$(dirname "$0")/.." || exit 1
curl -s http://127.0.0.1:8300/__manifest.json -o .dev/manifest.json
node -e '
const m = JSON.parse(require("fs").readFileSync(".dev/manifest.json","utf8"));
const s = m.scripts || {};
console.log("scripts 键:", Object.keys(s).join(", ") || "(空!)");
for (const [k, v] of Object.entries(s)) {
  console.log("  " + k + "  → " + v.length + " 个脚本");
  for (const p of v) console.log("      " + p);
}
'
