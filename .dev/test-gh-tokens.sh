#!/usr/bin/env bash
# 测试 D:\GoogleDownloads\github Token.txt 里的 token 是否有效 + 对本仓库有没有写权限
# ⚠️ 输出里只出现掩码（前缀 + 后四位），绝不打印 token 原文
cd /d/AgentTestLab/RhinE-UI || exit 1
export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897
FILE="/d/GoogleDownloads/github Token.txt"
REPO="AuthourAkson/RhinE-UI-Web"

if [ ! -f "$FILE" ]; then echo "找不到文件: $FILE"; exit 1; fi
echo "文件: $FILE（$(wc -c < "$FILE" | tr -d ' ') 字节）"
echo

# 提取候选 token（个人令牌 / 细粒度令牌 / OAuth 等常见前缀）
mapfile -t TOKENS < <(grep -oE '(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})' "$FILE" | sort -u)
if [ ${#TOKENS[@]} -eq 0 ]; then
  echo "没提取到形如 ghp_/github_pat_ 的 token。文件里可能写成了别的形式。"
  echo "（下面只显示每行的长度与前 8 个字符，方便你确认）"
  awk 'NF { printf "  第 %d 行: 长度 %d, 开头 \"%s\"\n", NR, length($0), substr($0,1,8) }' "$FILE"
  exit 1
fi
echo "提取到 ${#TOKENS[@]} 个候选 token（掩码显示）："
for i in "${!TOKENS[@]}"; do
  t="${TOKENS[$i]}"
  printf '  #%d  %s…%s  (长度 %d)\n' "$((i+1))" "${t:0:8}" "${t: -4}" "${#t}"
done
echo

for i in "${!TOKENS[@]}"; do
  t="${TOKENS[$i]}"
  echo "================ 测试 #$((i+1))  ${t:0:8}…${t: -4} ================"
  hdr=$(mktemp)
  body=$(curl -s -D "$hdr" -H "Authorization: Bearer $t" -H "Accept: application/vnd.github+json" \
         -H "User-Agent: rhine-deploy" "https://api.github.com/user" --max-time 30)
  code=$(head -1 "$hdr" | awk '{print $2}')
  scopes=$(grep -i '^x-oauth-scopes:' "$hdr" | tr -d '\r' | cut -d' ' -f2-)
  login=$(printf '%s' "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);process.stdout.write(j.login||('ERR '+(j.message||'')))}catch(e){process.stdout.write('无法解析')}})")
  echo "  /user        HTTP $code   账号: $login"
  [ -n "$scopes" ] && echo "  scopes       $scopes"
  rm -f "$hdr"

  # 对目标仓库的权限（permissions.push 才是能否推送的关键）
  body2=$(curl -s -H "Authorization: Bearer $t" -H "Accept: application/vnd.github+json" \
          -H "User-Agent: rhine-deploy" "https://api.github.com/repos/$REPO" --max-time 30)
  printf '%s' "$body2" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);if(j.permissions)console.log('  仓库权限     admin='+!!j.permissions.admin+' push='+!!j.permissions.push+' pull='+!!j.permissions.pull);else console.log('  仓库权限     读不到：'+(j.message||'?'))}catch(e){console.log('  仓库权限     无法解析')}})"
  echo
done
