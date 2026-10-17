#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 主题里 ActiveXObject 的所有用法 ==="
grep -rn 'ActiveXObject' themes/audio-archive/js/ | head -10
echo
echo "=== translate.js 里用到的 URL / 接口 ==="
grep -nE 'https?://|\.163\.com|mymemory|baidu|deepl|api/' themes/audio-archive/js/lib/translate.js | head -20
echo
echo "=== translate.js 里 NetEase 的请求构造（看是否加密接口）==="
grep -n 'netease\|NE_\|weapi\|eapi\|search\|lyric' themes/audio-archive/js/lib/translate.js | head -24
echo
echo "=== 宿主 shim 里现有的 utils.ReadTextFile / IsFile 之外的 IO ==="
grep -n 'ActiveXObject\|XMLHttp\|fetch(' shim/shim.js | head -12
