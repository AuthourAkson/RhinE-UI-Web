#!/usr/bin/env bash
# 查原版 profile 配置：JSplitter 面板设置 + 主题布局入口
P='/d/AgentTestLab/RhinE-1.4.0-portable/foobar2000/profile'
echo "=== profile 顶层 ==="
ls "$P" | head -30
echo
echo "=== 找 JSplitter/Spider Monkey 面板配置 ==="
find "$P" -maxdepth 2 -iname '*jsplitter*' -o -maxdepth 2 -iname '*spider*' -o -maxdepth 2 -iname '*.fcl' 2>/dev/null
echo
echo "=== 主题 frame.js（布局入口）行数 ==="
wc -l /d/AgentTestLab/RhinE-UI/themes/audio-archive/js/frame.js 2>/dev/null
echo
echo "=== 主题里面板区域计算的代码 ==="
grep -n "M\[" /d/AgentTestLab/RhinE-UI/themes/audio-archive/js/frame.js | head -40
