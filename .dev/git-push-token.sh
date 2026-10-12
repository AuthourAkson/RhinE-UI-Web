#!/usr/bin/env bash
# 用 GitHub fine-grained token 非交互推送（不再走 GCM，不会再弹窗/挂住）
#
# token 存放：<secrets>/github-token.txt（默认 /d/Skill实验室/.secrets/，**仓库之外**，不会被提交）。
# 若该文件不存在，就从用户给的 D:\GoogleDownloads\github Token.txt 里提取第一个并落盘（只落一份，不打印原文）。
# 推送用 `git -c credential.helper= -c http.extraheader=...`，**不写入任何配置文件**，只在这次调用里生效。
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897

SECRETS=${SECRETS_DIR:-/d/Skill实验室/.secrets}
TOKEN_FILE="$SECRETS/github-token.txt"
SRC="/d/GoogleDownloads/github Token.txt"

if [ ! -s "$TOKEN_FILE" ]; then
  [ -f "$SRC" ] || { echo "没有 token 文件：$TOKEN_FILE 与 $SRC 都不存在"; exit 1; }
  t=$(grep -oE '(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})' "$SRC" | head -1)
  [ -z "$t" ] && { echo "在 $SRC 里没找到 token"; exit 1; }
  mkdir -p "$SECRETS"
  printf '%s' "$t" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE" 2>/dev/null || true
  echo "已从下载文件提取 token 存入 $TOKEN_FILE（掩码 ${t:0:8}…${t: -4}，仓库之外，不会提交）"
fi

TK=$(tr -d '\r\n' < "$TOKEN_FILE")
B64=$(printf 'x-access-token:%s' "$TK" | base64 | tr -d '\n')

echo "目标: $(git rev-parse --short HEAD) → origin/main（当前远端 $(git rev-parse --short origin/main)）"
out=$(timeout 300 git -c credential.helper= -c "http.extraheader=AUTHORIZATION: Basic $B64" push origin main 2>&1); rc=$?
printf '%s\n' "$out" | tail -4
if [ $rc -eq 0 ]; then
  echo "推送成功 ✓  远端记录 = $(git rev-parse --short origin/main)"
else
  echo "推送失败 ✗ 退出码 $rc"
fi
exit $rc
