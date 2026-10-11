#!/usr/bin/env bash
# 用正确的 Windows 路径算 key，找到 Mili 那首的波形缓存
set -u
node -e '
const fs = require("fs"), path = require("path");
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }
const song = "D:/AgentTestLab/RhinE-1.4.0-portable/musiclab/Mili - world.execute (me) ;.mp3";
const cache = "D:/AgentTestLab/RhinE-1.4.0-portable/foobar2000/profile/audio-archive-cache/waveform/";
const st = fs.statSync(song);
console.log("文件大小 =", st.size);
const p = "D:\\AgentTestLab\\RhinE-1.4.0-portable\\musiclab\\" + path.basename(song);
const files = fs.readdirSync(cache);
let hit = null;
// 时长未知就在 200~215 秒之间扫，步长 0.01
for (let ms = 20000; ms <= 21500 && !hit; ms++) {
  const len = (ms / 100).toFixed(2);
  const key = fnv(p + "|0|" + st.size + "|" + len);
  if (files.includes(key + ".json")) { hit = { key, len }; }
}
if (!hit) { console.log("没命中（时长可能超出扫描范围）"); console.log("缓存里的 key:", files.join(" ")); }
else {
  console.log("✔ 命中", hit.key + ".json", " length =", hit.len, "秒");
  const arr = JSON.parse(fs.readFileSync(cache + hit.key + ".json", "utf8"));
  const n = arr.length, s = arr.slice().sort((a, b) => a - b), q = pp => s[Math.floor(pp * (n - 1))];
  console.log("  点数=" + n, "均值=" + (arr.reduce((a, b) => a + b, 0) / n).toFixed(1), "最大=" + s[n - 1]);
  console.log("  分位 p10=" + q(.1), "p25=" + q(.25), "p50=" + q(.5), "p75=" + q(.75), "p90=" + q(.9), "p99=" + q(.99));
  console.log("  >900 占比=" + (arr.filter(v => v > 900).length / n * 100).toFixed(1) + "%");
  console.log("  前 24:", arr.slice(0, 24).join(","));
  console.log("  中段 24:", arr.slice(500, 524).join(","));
  console.log("  后 24:", arr.slice(-24).join(","));
}
'
