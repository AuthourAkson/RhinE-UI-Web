#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
echo "=== 主题 ring2D 里怎么组装 pts 并调用 DrawLines（102-150 行）==="
sed -n '102,150p' themes/audio-archive/js/lib/ring.js
echo
echo "=== shim 的 DrawLines / DrawLine 实现 ==="
grep -n 'DrawLines(\|DrawLine(' -A 12 shim/shim.js | head -34
echo
echo "=== shim 的 Scale / PushTransform / PopTransform ==="
grep -n 'Scale(\|PushTransform(\|PopTransform(' -A 6 shim/shim.js | head -26
