#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
网页版首选项：让右上角 PREFERENCES 真正可用

原版语义：右上角 PREFERENCES 调 fb.ShowPreferences()——**foobar2000 的原生设置对话框**
（Media Library 文件夹、Display › Columns UI › Colours and fonts、Playback / Output / DSP…）。
浏览器里没有 foobar2000，所以之前它是个空实现（ShowPreferences() {}），按钮点了没反应；
同一个调用还被「菜单 › foobar2000 Preferences…」和 DSP 菜单的兜底项使用，也一起是死的。

按用户选择做成"完整的网页版首选项"（只放**端口特有、主题 MENU 里放不下**的东西；
主题自己的设置仍在 MENU 里）：

  · 曲库 / MEDIA LIBRARY：来源（演示曲库 / 本地文件夹 / 未载入）、曲目·专辑数、总时长·体积，
    以及 [选音乐文件夹…]（复用 File System Access 那条链路）、[重新扫描]、[载入演示曲库]，
    并注明目录句柄持久化（IndexedDB）尚未实现
  · 缓存与设置：清空波形 / 封面缓存（广播到各面板的内存缓存，shim 新增 __rhine.clearCache）、
    恢复默认设置（清空 rhine:file: / rhine:prop: 后重载）
  · 快捷键：1–5 / T / P / B / S / R / I / / / Esc / 空格
  · 关于：主题版本（读主题根的 VERSION）、移植说明、清单构建时间、面板数与清单文件数、
    视口与 dpr、浏览器、字体是否加载

实现：shim 的 ShowPreferences() → HOST.command('preferences')；对话框画在**顶层页面**上
（面板只是 iframe，画在面板里会被裁掉——菜单那一课）。
Esc 的监听同时挂在顶层与**每个面板文档**上（键盘焦点通常在面板里，只挂顶层关不掉，实测）。

顺带修掉一个小遗漏：清单原先只收有扩展名的文本文件，主题根的 **VERSION（无扩展名）** 收不到，
于是 themeVersion() 一直返回空串（菜单里"检查更新… RhinE"后面是空的）。现在 VERSION/LICENSE/README
这类无扩展名文件也收作文本。

验证：
· 点 PREFERENCES 弹出对话框：来源=演示曲库（?demo=1）、7 首 / 2 张、05:03 / 10.8 MB、
  快捷键 10 条齐全、关于里 RhinE 1.4.0 / 10 个 iframe 面板 · 清单 2674 个文件 / 1707×899 @ dpr 1.5
· [清空波形 / 封面缓存] 生效并关闭对话框（宿主日志：已清空缓存：0 条）
· 再打开 → 按 Esc 关闭（挂在面板文档上之后有效）
MSG
echo "已提交："; git log --oneline -1
