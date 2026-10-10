#!/usr/bin/env bash
# 逐个点击工具栏的 SHOW / LAYOUT / GROUP / SORT 按钮，验证功能是否生效
# 坐标是 CSS px（当前视口 1618×933，deviceScaleFactor 1.25）
set -u
export CDP_PORT=${CDP_PORT:-9226}
cd '/d/Skill实验室/tools' || exit 1
S='D:\AgentTestLab\RhinE-UI\.dev\toolbar-state.js'

show() { node cdp.js eval - "$S" | grep -E '"(unit|layout|groupBy|sortBy)"' | tr -d ' \n' ; echo ""; }

echo "=== 起始状态 ==="
show

for pair in "478:105:SHOW=ALBUMS" "523:105:SHOW=TRACKS" "662:105:LAYOUT=ARRAY" "709:105:LAYOUT=GRID" \
            "339:136:GROUP=GENRE" "391:136:GROUP=DECADE" "438:136:GROUP=A-Z" "479:136:GROUP=NONE" \
            "578:136:SORT=ARTIST" "631:136:SORT=TITLE" "678:136:SORT=YEAR" "725:136:SORT=ADDED"; do
  x=${pair%%:*}; rest=${pair#*:}; y=${rest%%:*}; name=${rest#*:}
  node cdp.js clickxy - "$x" "$y" >/dev/null
  sleep 2
  printf '%-18s → %s\n' "$name" "$(show)"
done
