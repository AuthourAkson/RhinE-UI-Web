#!/usr/bin/env bash
# 定稿启动器：中文文件名（好双击）+ 纯 ASCII 内容 + CRLF 行尾（batch 必须是 CRLF）
cd /d/AgentTestLab/RhinE-UI || exit 1

cp launcher.cmd "启动 RhinE-UI.cmd"
cp stopper.cmd  "停止 RhinE-UI.cmd"
rm -f launcher.cmd stopper.cmd

# 转成 CRLF（batch 文件用 LF 会让 cmd 解析错乱：实测出现 'cp' is not recognized 这类怪错）
for f in "启动 RhinE-UI.cmd" "停止 RhinE-UI.cmd"; do
  sed -i 's/\r$//' "$f"          # 先统一成 LF
  sed -i 's/$/\r/' "$f"          # 再统一加 CR
  printf '%-24s %s 行, CRLF=%s\n' "$f" "$(wc -l < "$f" | tr -d ' ')" "$(grep -c $'\r' "$f")"
done

echo
echo "=== 目录里的启动相关文件 ==="
ls -1 *.cmd *.sh 2>/dev/null
