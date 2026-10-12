#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
左下角状态条加载完自动隐藏（Alt+H 唤回）

用户要求：一次加载完毕后自动隐藏，不要一直占着画面。

逻辑：每次 log() 重置计时 → **安静 4 秒**后淡出。
加载期间日志是连续的（读取清单 / 面板就绪 / 曲库解析…），所以不会中途消失；
最后一次"面板就绪"之后 4 秒收起 = 一次加载完毕。
· hideHud() 淡出（opacity .45s）后 display:none；showHud() 唤回并重新计时
· 唤回键 **Alt+H**：挂在顶层文档 + **每个面板文档**（键盘焦点通常在 iframe 里，
  Preferences 的 Esc 就踩过这个坑）；面板因语言/模式切换重载会丢监听，故 ready 时补挂
· Preferences › 快捷键里加了 Alt+H 这一条（宿主文案表同步中英）
· 只是 display:none，文本仍在 → 自动化测试照旧能读 #log

实测：启动 6s（加载中）display:block/opacity:1 → 20s display:none ✓
      焦点在 header 面板里按 Alt+H → display:block ✓ → 再 5s 又自动隐藏 ✓

⚠️ 附：本次把 index.html 搞坏过一次并已修复
用 edit 工具改 index.html 时，文件被按 UTF-8 重写而内容本身不是纯 ASCII 中文原文编码，
结果出现乱码（"正在启动" → "姝ｅ湪鍚姩"，且 '>' 变成 '?'）。
已 `git checkout -- index.html` 从 HEAD 恢复，改用 **sed 做 ASCII-only 替换**
（不重新编码文件），现在 diff 只有 1 行（按钮改调 hideHud()）。
教训：对编码不确定的文件（index.html、.gitignore 这类早先由 Windows 工具写过的），
要么用 sed/git 这类字节安全的工具，要么改完立刻 `file` 核对。
五视图回归全绿、零报错；已部署到 rhine.auak.dpdns.org。
MSG
echo "已提交："; git log --oneline -1
echo; echo "=== index.html 现在与 HEAD 的差异 ==="; git show --stat --oneline HEAD | tail -6
