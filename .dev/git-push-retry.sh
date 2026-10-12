#!/usr/bin/env bash
# 可靠推送（2026-10-12 踩坑后重写）
#
# 之前这里写的是 `timeout 60 git push`。结果连着 5 次"超时失败"，
# 我据此**误判**成"凭据管理器需要用户交互登录"，还去让用户点 —— 实测证明完全不需要：
#   GCM_INTERACTIVE=never + GIT_TERMINAL_PROMPT=0 下，只读鉴权 **1.5 秒**就通过。
# 真实原因只有两个：① 一次 SSL_ERROR_SYSCALL 网络抖动；② 60 秒对本机这条链路太短。
#
# 现在的策略：
#   · GCM_INTERACTIVE=never —— 万一真需要交互，**立刻报错**而不是静默挂住（不再误判）
#   · 超时放宽到 300 秒，最多 3 次（网络抖动用重试解决）
#   · 三次都失败时自动跑只读鉴权测试，直接给出结论：是"要交互"还是"网络卡"
cd /d/AgentTestLab/RhinE-UI || exit 1
export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never

echo "目标: 把 $(git rev-parse --short HEAD) 推到 origin/main（当前远端记录 $(git rev-parse --short origin/main)）"
for i in 1 2 3; do
  echo "--- 第 $i 次尝试（超时 300s）---"
  out=$(timeout 300 git push origin main 2>&1); rc=$?
  if [ $rc -eq 0 ]; then
    printf '%s\n' "$out" | tail -3
    echo "推送成功 ✓  远端记录 = $(git rev-parse --short origin/main)"
    exit 0
  fi
  printf '%s\n' "$out" | grep -E 'fatal|error|rejected|SSL|timed out|denied' | head -3
  echo "  退出码 $rc，等 5 秒再试"
  sleep 5
done

echo
echo "=== 三次都没成功，跑只读鉴权测试定位 ==="
if timeout 45 git ls-remote origin -h refs/heads/main > /dev/null 2>&1; then
  echo "  ✓ 鉴权正常 → 是网络/传输问题（稍后重跑即可，不用动凭据、更不用你点）"
else
  echo "  ✗ 鉴权也失败 → 这才可能是凭据过期，需要一次交互式登录"
  echo "     （去掉 GCM_INTERACTIVE=never 跑一次 git push，按弹窗登录即可）"
fi
exit 1
