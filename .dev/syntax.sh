#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
for f in app.js serve.mjs shim/shim.js native/playlist.js workers/library-web.js; do
  if node --check "$f" 2>&1; then echo "OK   $f"; else echo "FAIL $f"; fi
done
