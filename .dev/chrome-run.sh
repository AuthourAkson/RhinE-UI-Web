#!/usr/bin/env bash
# 起一个临时无头 Chrome → 跑测试 → **无论如何都关掉**
#
# 为什么需要它：以前我手动起无头 Chrome 做验证，跑完忘了关，用户每次都得自己关掉。
# 现在测试一律经这个包装脚本跑，退出时（含 Ctrl+C / 报错）自动清理，不留后台进程。
#   ⚠️ 只杀"用本项目 .dev/chrome-profile 配置"的实例，绝不动用户自己的 Chrome。
#
# 用法：chrome-run.sh <测试脚本.mjs> [参数…]
set -u
CHROME='/c/Program Files/Google/Chrome/Application/chrome.exe'
[ -x "$CHROME" ] || CHROME='/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
PROFILE='D:\AgentTestLab\RhinE-UI\.dev\chrome-profile'
PORT=${CDP_PORT:-9226}

kill_mine() {
  powershell.exe -NoProfile -Command \
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { \$_.CommandLine -like '*RhinE-UI\\.dev\\chrome-profile*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" \
    >/dev/null 2>&1 || true
}
trap 'kill_mine; echo "[chrome-run] 已关闭无头 Chrome"' EXIT

kill_mine   # 先清掉可能残留的上一次
"$CHROME" --headless=new --remote-debugging-port=$PORT --user-data-dir="$PROFILE" \
  --window-size=1600,1000 --no-first-run --no-default-browser-check \
  --autoplay-policy=no-user-gesture-required about:blank >/dev/null 2>&1 &

for i in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/json/version" 2>/dev/null; then break; fi
  sleep 0.5
done
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/json/version" 2>/dev/null; then
  echo "[chrome-run] 无头 Chrome 没起来（端口 $PORT）"; exit 1
fi
echo "[chrome-run] 无头 Chrome 就绪（端口 $PORT），开始跑：$*"
cd /d/AgentTestLab/RhinE-UI || exit 1
export CDP_PORT=$PORT
node "$@"
