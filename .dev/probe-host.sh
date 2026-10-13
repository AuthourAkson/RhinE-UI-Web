#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== app.js 里的视口/布局尺寸来源 ==="
grep -n 'innerWidth\|innerHeight\|__RHINE_VIEW__\|DPR\|DPI\|devicePixelRatio' app.js | head -24
echo
echo "=== 面板几何是怎么下发的（Move/region/size 消息）==="
grep -n "event: *'size'\|type: *'size'\|Move(\|movePanel\|applyLayout\|layout(" app.js | head -18
echo
echo "=== 主题自己的 regions 是怎么被调用的（frame.js）==="
grep -n 'function regions' -A 18 themes/audio-archive/js/frame.js | head -30
