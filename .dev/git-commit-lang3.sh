#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修复：菜单点别处关不掉、切语言黑屏、以及"设置写了永远读不回来"

用户实测三个现象：① Audio Archive 子菜单打开后不选项就关不掉；
② 从中文切英语后画面直接黑屏；③ 重启后 menu 里 language 是英语、开场动画却还是中文，
   而且整个界面只有一部分（标签页）变成英文。

① 菜单点别处关不掉
   菜单画在顶层文档上，可"点别处关闭"的监听只挂在顶层文档 —— 而**整个 UI 都是 iframe**，
   在面板里点击不会冒泡到顶层文档 → 永远关不掉。现在给每个同源面板文档都挂一份
   （mousedown 捕获 + keydown + resize），关闭时逐个摘掉。

② 切语言黑屏
   主题切换界面语言用的是 window.Reload()（lib/i18n.js → lib/bus.js 的 "ui-lang"），
   面板 iframe 会**自己重载**，load 事件再次触发。而宿主的 start() 有 `if (p.__started) return`
   → 重载后的新页面永远等不到 __boot（要靠它拿清单和脚本顺序）→ 整块面板黑屏。
   现在每次 load 都清掉 __started/__ready 并重新启动。

③ 只有部分界面变英文（以及所有设置都读不回来）—— 根因最严重
   shim 的 ReadTextFile 顺序反了：先查 MANIFEST.text（仓库里的默认文件），再查 localStorage
   覆盖层。而 audio-archive-settings.json 这份**默认文件本身就在仓库里** → 于是用户保存过的
   设置**从来没被读到过**，读到的始终是原始默认值。
   症状链条：点菜单切换语言的只有 header 面板，它的 window.GetProperty 兜底记住了 en；
   其它面板读默认文件 → 没有 uiLang 这个键 → 回退系统语言 → 中文。
   于是"标签页英文、其它中文""开场动画还是中文"。
   现在改为 **localStorage 覆盖层优先，仓库默认兜底**（这也正是代码注释里写的本意）。
   注意：这条同时修好了配色 / 视图 / 播放列表预设 / 皮肤 / 字号等所有设置的持久化。

验证（1707×899 @dpr1.5，抓的是 7 个面板的 UI_LANG）：
  起始            header:zh-CN stage:zh-CN transport:zh-CN manager:zh-CN head:zh-CN card:zh-CN fx:zh-CN
  切到 English    …全部 en（无黑屏，2 秒内完成）
  整页重载后      …仍然全部 en
  切回简体中文    …全部 zh-CN
  再整页重载      …仍然全部 zh-CN
· 菜单：点 stage 面板空白 / 点 header 空白，两种路径都能关闭
MSG
echo "已提交："; git log --oneline -1
