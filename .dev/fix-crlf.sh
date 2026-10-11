#!/usr/bin/env bash
# 把启动器统一成 CRLF（edit 工具写入的是 LF）
cd /d/AgentTestLab/RhinE-UI || exit 1
for f in "启动 RhinE-UI.cmd" "停止 RhinE-UI.cmd"; do
  sed -i 's/\r$//' "$f"
  sed -i 's/$/\r/' "$f"
  crlf=$(grep -c $'\r' "$f")
  lines=$(wc -l < "$f" | tr -d ' ')
  echo "$f  行数=$lines  CRLF行=$crlf"
done
echo
echo "=== 浏览器探测那段 ==="
grep -n 'CHROME2\|for %%v\|opening app window' "启动 RhinE-UI.cmd"
