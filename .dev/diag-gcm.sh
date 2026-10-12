#!/usr/bin/env bash
# 查 GCM 为什么卡：配置、辅助程序、日志、残留进程
echo "=== credential.helper 配置 ==="
git config --get-all credential.helper
git config --get credential.credentialStore
echo
echo "=== GCM 相关进程 ==="
tasklist 2>/dev/null | grep -iE 'credential|gcm|git-credential' || echo "  （没有）"
echo
echo "=== GCM 日志目录 ==="
for d in "$USERPROFILE/.git-credential-manager" "$LOCALAPPDATA/.gcm" "$USERPROFILE/.gcm" "$APPDATA/Git Credential Manager"; do
  [ -d "$d" ] && echo "  $d:" && ls -t "$d" 2>/dev/null | head -4
done
echo
echo "=== 最近一次的 GCM trace（若有）==="
f=$(ls -t "$USERPROFILE"/.git-credential-manager/*.log "$LOCALAPPDATA"/.gcm/*.log 2>/dev/null | head -1)
if [ -n "${f:-}" ]; then tail -12 "$f"; else echo "  （没有日志）"; fi
echo
echo "=== 凭据库里有没有 github ==="
cmdkey /list 2>/dev/null | grep -iA2 'github' | head -8 || echo "  （cmdkey 没列出 github）"
