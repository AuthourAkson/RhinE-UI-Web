#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修线上"一加载就刷 33 条 SyntaxError"：transport 面板被 boot 两次 → 主题脚本注入两遍

现象（线上实测，本地 dist 不复现）：
  阶段① 加载完成: 33 条
  [exception] Uncaught SyntaxError: Identifier 'SETTINGS_FILE' has already been declared
  面板脚本数: transport 30 个（正常 14+1）
→ transport 面板收到了**两次 iframe load**，宿主两次调 start() → shim 两次 __boot
  → 主题脚本被注入两遍 → 第二次执行 settings.js 时 `const SETTINGS_FILE` 重复声明。

修法：__boot 检测同一 realm 的重复调用 ——
  · 跳过"新建画布 + 注入脚本"这两件只能做一次的事
  · **但照常重跑握手 finishBoot()**（第一次我直接 return，结果面板不再报 ready，
    模式切换被卡死、探针 eval 超时 —— 这个坑当场踩到并改掉了）
  · 真正的 window.Reload() 是导航，realm 全新、标记不存在，所以刷新/重载照常

线上复验：
  阶段① 加载 0 条、切 light 0 条、切回 dark 0 条 ✓
  transport 脚本数 30 → **16** ✓（其余面板 15~29，均为单次注入）

附：本提交同时包含此前"Signal 浅色中心空白"修复（ee8d5f4，本地提交后因代理未开未推）
  所依赖的探测脚本，以及本轮的收尾脚本。
MSG
echo "已提交："; git log --oneline -1
