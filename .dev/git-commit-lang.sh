#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
rm -f .dev/*-out.txt .dev/menu-dbg.txt .dev/menu-dump.txt 2>/dev/null || true
git add -A
git commit -q -F - <<'MSG'
菜单真正可用 + 界面语言（简体中文）；译文用原版 lib/lang/zh-CN.js

用户反馈："menu 菜单好像是摆设，默认都是英语，需要能转中文，加到打开的菜单里，中文按原版写"。
三个独立问题，逐个修：

一、菜单是空壳（所有菜单都点不动）
    shim 的 CreatePopupMenu() 原本返回 popupStub()：AppendMenuItem 什么都不做、
    TrackPopupMenu 直接返回 0 → 主题每个菜单（MENU、播放列表右键、排序菜单…）全是摆设。
    现在实现真菜单，关键难点是**同步语义**：主题写的是
        theme.AppendTo(root, 0, "Audio Archive");
        const id = root.TrackPopupMenu(x, y, 0);
        if (id === 4) …                      ← 一长串分支紧接着执行
    而 DOM 菜单天生异步。做法：
      ① TrackPopupMenu 先把菜单画出来并返回 0（主题那串分支落空，界面不受影响）；
      ② 用户点选后记下 id，然后**重放打开菜单时的那次输入事件**（ev/evRet 里记下的
         handler 名 + 参数），这一次 TrackPopupMenu 立刻返回该 id → 同步分支真的执行。
    支持多级子菜单、勾选（●）、禁用、分隔线、tab 右侧提示（"检查更新…  RhinE 1.4.0"）。

二、菜单画在面板 iframe 里被裁掉
    每个面板只是 iframe，header 只有 73px 高 —— 菜单画在自己的 document 里，
    下半截既看不见也点不到（实测菜单对象是生成了、但 y>73 的行点不到）。
    现在画在**顶层页面**（window.top，同源），坐标用 frameElement 的 rect 换算成页面坐标；
    外侧点击关闭 / Esc 关闭 / 窗口尺寸变化关闭都挂在顶层。

三、界面语言：默认英文 + 语言菜单选了也没用
    · 默认语言：lib/i18n.js:14 用 `new ActiveXObject("WScript.Shell")` 读注册表拿
      Windows 显示语言，浏览器里没有这个 API → 主题 catch 掉 → SYSTEM_LANG 退回 "en"。
      shim 现在提供最小替身，把语言标签从 navigator 报回去（中文系统 → "zh-CN"）。
    · 语言表从未加载：i18n.js 里是
          const f = fb.ProfilePath + `…/lang/${UI_LANG}.js`;  if (utils.IsFile(f)) include(f);
      路径含运行时变量、include 的实参也是变量 → serve.mjs 的静态依赖图认不出来，
      于是"设了中文也还是英文"。现在把存在的语言表补在 i18n.js 之后（I18N 在那里声明）、
      其它用 tr() 的文件之前。
    · 语言菜单主题本来就有（header.js:388-391、408），修好菜单后即生效：
      Audio Archive › Language · 语言 · 言語 › [English | ●简体中文 | 日本語]，
      选择后写入设置 uiLang + 广播 ui-lang → 各面板 Reload。
    译文全部来自原版自带的 themes/audio-archive/js/lib/lang/zh-CN.js（未新增任何译文）。

验证：
· 默认 UI_LANG = zh-CN；导航 档案/播放列表/歌词/信号/外观、搜索存档、偏好设置、菜单
· MENU 顶层 = File/Edit/View/Playback/Library/Help/Audio Archive（前 6 项是 foobar2000 原生菜单）
· Audio Archive 子菜单 22 项，含中文译名（查看尺寸/档案地面/…/检查更新…RhinE）
· 语言子菜单 ●English / 简体中文 / 日本語，勾选与当前语言一致；点选后面板重载并切换
· 子菜单位置经日志核对：Audio Archive 子菜单 x=1305（紧贴 1510..1700 那行左侧）
MSG
echo "已提交："; git log --oneline -1
