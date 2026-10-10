#!/usr/bin/env bash
# 对比原版与移植版的主题运行时设置
SRC='/d/AgentTestLab/RhinE-1.4.0-portable/foobar2000/profile/audio-archive-settings.json'
echo "=== 原版设置 ==="
cat "$SRC"
echo
echo "=== 移植版设置文件在哪 ==="
find /d/AgentTestLab/RhinE-UI -maxdepth 3 -name '*settings*' -not -path '*/node_modules/*' 2>/dev/null
echo
echo "=== frame.js 布局区域计算（80-130行）==="
sed -n '80,130p' /d/AgentTestLab/RhinE-UI/themes/audio-archive/js/frame.js
