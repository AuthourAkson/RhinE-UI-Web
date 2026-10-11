#!/usr/bin/env bash
LOG='/d/AgentTestLab/RhinE-UI/themes/audio-archive/columns'
echo "=== 移植版 columns 目录 ==="
ls -la "$LOG"
echo
echo "=== preset-index.json ==="
cat "$LOG/preset-index.json" 2>/dev/null | head -40
echo
echo "=== 原版包里的 columns 目录 ==="
ls -la '/d/AgentTestLab/RhinE-1.4.0-portable/foobar2000/profile/themes/audio-archive/columns/' 2>/dev/null
echo
echo "=== 原版 profile 里的 playlist 相关配置（theme.fth 等）==="
ls -la /d/AgentTestLab/RhinE-1.4.0-portable/foobar2000/profile/*.fth /d/AgentTestLab/RhinE-1.4.0-portable/foobar2000/profile/*.fcl 2>/dev/null
echo
echo "=== theme.fth 是否含可读的列格式 ==="
strings -n 6 /d/AgentTestLab/RhinE-1.4.0-portable/foobar2000/profile/theme.fth 2>/dev/null | grep -iE '%title%|%artist%|%length%|tracknumber|NO\.' | head -10 || echo "(strings 不可用或无匹配)"
