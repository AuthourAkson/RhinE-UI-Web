#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 仍留在 log() 里的中文（目标项应已消失）==="
grep -nE "log\((\`|')" app.js | grep -E '曲库|媒体库|播放|扫描|取消|不支持|模式切换|配色|拾取模式|HTTP 曲库' || echo "  （目标项都已改成 ht() ✓）"
echo
echo "=== ht(' 调用数 ==="
grep -c "ht('" app.js
echo
echo "=== applyHostLang 是否在启动时调用 ==="
grep -n "applyHostLang()" app.js
