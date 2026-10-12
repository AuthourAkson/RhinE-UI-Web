#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1

echo "=== 最近的 wrangler 日志尾部 ==="
latest=$(ls -t "$HOME/AppData/Roaming/xdg.config/.wrangler/logs"/wrangler-*.log 2>/dev/null | head -1)
if [ -n "${latest:-}" ]; then
  echo "  文件: $latest"
  tail -25 "$latest" | sed 's/\x1b\[[0-9;]*m//g'
else
  echo "  （没找到日志）"
fi

echo
echo "=== 代理连通性（api.cloudflare.com）==="
curl -s -o /dev/null -w "  经代理: HTTP %{http_code}  用时 %{time_total}s\n" -x http://127.0.0.1:7897 --max-time 20 https://api.cloudflare.com/client/v4/user/tokens/verify || echo "  经代理失败"
curl -s -o /dev/null -w "  直连  : HTTP %{http_code}  用时 %{time_total}s\n" --max-time 20 https://api.cloudflare.com/client/v4/user/tokens/verify || echo "  直连失败"

echo
echo "=== dist 体积（上传量参考）==="
du -sh dist 2>/dev/null || echo "  ?"
