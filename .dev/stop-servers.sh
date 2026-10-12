#!/usr/bin/env bash
# 收尾：停掉本次会话起的本地服务器（8300 开发服务器 / 8310 dist 验证服务器），
# 免得占着端口影响用户自己用启动器。只按"监听端口"定位 PID，不做通杀。
for port in 8300 8310; do
  pid=$(netstat -ano | grep -E ":${port}[[:space:]]" | grep LISTENING | awk '{print $5}' | head -1)
  if [ -n "$pid" ]; then
    taskkill //F //PID "$pid" >/dev/null 2>&1 && echo "已停止端口 ${port} 的进程 PID ${pid}" || echo "端口 ${port} 的进程 ${pid} 停止失败"
  else
    echo "端口 ${port} 空闲"
  fi
done
echo
echo "--- 端口检查 ---"
if netstat -ano | grep -E ":(8300|8310)[[:space:]]" | grep -q LISTENING; then
  netstat -ano | grep -E ":(8300|8310)[[:space:]]" | grep LISTENING
else
  echo "8300 / 8310 都已释放 ✓"
fi
