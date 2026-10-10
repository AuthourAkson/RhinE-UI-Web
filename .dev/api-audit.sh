#!/usr/bin/env bash
# 枚举主题用到的所有宿主成员（这次包含数字），用来跟 shim 覆盖面对账
cd /d/AgentTestLab/RhinE-UI/themes/audio-archive/js || exit 1
for obj in d2d window fb plman utils; do
  echo "===== $obj.* ====="
  grep -rhoE "\b$obj\.[A-Za-z_0-9]+" . | sed "s/^$obj\.//" | sort -u | tr '\n' ' '
  echo ""
done
echo "===== gr.* （画布对象方法） ====="
grep -rhoE '\bgr\.[A-Za-z_0-9]+' . | sed 's/^gr\.//' | sort -u | tr '\n' ' '
echo ""
echo "===== LoadImageAsyncV2 的调用点 ====="
grep -rnE 'LoadImageAsyncV2|LoadImageAsyncV\b' . | head -8
echo "===== Worker 的用法 ====="
grep -rnE 'new Worker|libWorker|onmessage|postMessage' lib/library.js | head -14
