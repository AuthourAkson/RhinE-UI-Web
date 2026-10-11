#!/usr/bin/env bash
echo "=== Node 版本 ==="
node -v
echo
echo "=== 8300 端口是否已在跑 ==="
curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8300/ 2>/dev/null || echo "(没在跑)"
echo
echo "=== 首页是否返回内容 ==="
curl -s http://127.0.0.1:8300/ 2>/dev/null | head -5
echo
echo "=== 演示曲库（本地是否还在）==="
ls -1 /d/AgentTestLab/RhinE-UI/.dev/music/ 2>/dev/null
find /d/AgentTestLab/RhinE-UI/.dev/music -name '*.mp3' -o -name '*.flac' 2>/dev/null | wc -l
echo
echo "=== 是否有 package.json（要不要 npm install）==="
ls -1 /d/AgentTestLab/RhinE-UI/package.json 2>/dev/null || echo "没有 → 零依赖，不需要 npm install"
