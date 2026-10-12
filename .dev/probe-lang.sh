#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 仓库里的默认设置文件 audio-archive-settings.json ==="
cat audio-archive-settings.json
echo
echo "=== 主题 getSetting / setSetting ==="
sed -n '1,45p' themes/audio-archive/js/lib/settings.js
echo
echo "=== 主题 i18n.js 的语言选择 ==="
sed -n '1,45p' themes/audio-archive/js/lib/i18n.js
