#!/usr/bin/env bash
# 收尾：剩下 5 条状态行文案 + 启动时应用宿主语言
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
python - <<'PY'
import io
p = 'app.js'
s = io.open(p, encoding='utf-8').read()

# 1) 词典补 5 条
table_add = """    'Colour scheme → {0} ({1})': '配色方案 → {0}（{1}）',
    'Track {0} has no playable source': '第 {0} 首没有可播放来源',
    'Removed {0} playlist items': '播放列表移除 {0} 项',
    'Playlist renamed → {0}': '播放列表改名 → {0}',
    'Auto playlist “{0}”: {1} tracks': '自动播放列表「{0}」：{1} 首',
    'Playlist deleted (was index {0})': '播放列表已删除（原下标 {0}）',
"""
old_line = "    'Colour scheme → {0} ({1})': '配色方案 → {0}（{1}）',\n"
assert old_line in s
s = s.replace(old_line, table_add, 1)

# 2) 替换这 5 处调用
subs = [
 ("log(`第 ${i + 1} 首没有可播放来源`)", "log(ht('Track {0} has no playable source', i + 1))"),
 ("log(`播放列表移除 ${gone.length} 项`)", "log(ht('Removed {0} playlist items', gone.length))"),
 ("log(`播放列表改名 → ${name}`)", "log(ht('Playlist renamed → {0}', name))"),
 ("log(`自动播放列表「${name}」：${items.length} 首`)", "log(ht('Auto playlist “{0}”: {1} tracks', name, items.length))"),
 ("log(`播放列表已删除（原下标 ${i}）`)", "log(ht('Playlist deleted (was index {0})', i))"),
]
for a, b in subs:
    if a not in s:
        print('MISS:', a[:40])
    else:
        s = s.replace(a, b, 1)

# 3) main() 启动时应用一次宿主语言（HUD 按钮文案）
anchor = "async function main() {\n"
assert anchor in s
s = s.replace(anchor, anchor + "  applyHostLang();                     // HUD 按钮文案跟随主题的界面语言\n", 1)

io.open(p, 'w', encoding='utf-8').write(s)
print('OK')
PY
node --check app.js && echo "语法 OK"
grep -n "applyHostLang" app.js | head -4
