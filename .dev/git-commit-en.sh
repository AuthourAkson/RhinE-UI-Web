#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
默认界面语言改成英文（不改主题：用主题自己的默认设置文件）

做法：往仓库里的 audio-archive-settings.json 加一个键
    "uiLang": "en"
理由：主题的 getSetting('uiLang', 系统语言) 是 **先读这份设置文件**、
      读不到才回落到 Windows 显示语言（lib/settings.js + lib/i18n.js）。
      这份文件在清单里是内联的默认值，而用户自己的选择写在 localStorage 覆盖层、优先级更高 ——
      所以"默认英文 + 用户改过就听用户的"正好由主题既有机制实现，**不用动主题一个字节**。

顺带修掉一个同源不一致：宿主的 hostLang() 原先只看 localStorage，
  没看清单里的默认设置文件 → 于是默认改英文后，主题是英文、左下角 HUD 还是中文（实测）。
现在宿主与主题 **完全同序**：localStorage 覆盖层 → 清单内联的默认设置 → 系统语言；
  并且在清单加载完成后补喊一次 applyHostLang()（默认值就在清单里，太早调用读不到）。

实测（清空 localStorage 模拟全新访客）：
  清单默认设置含 "uiLang": "en" ✓
  主题 UI_LANG = en ✓、getSetting('uiLang') = en ✓
  HUD 按钮 = "Pick element / Hide" ✓（修复前是"拾取元素 / 隐藏"）
  整页英文：01 ARCHIVE / 02 PLAYLISTS / …、SHOW·LAYOUT·GROUP·SORT、
           NO ALBUMS · THE MEDIA LIBRARY AND THE PLAYLISTS ARE EMPTY、
           + ADD MUSIC FOLDER、+ LOAD DEFAULT AUDIO LIBRARY

注意：**已经访问过的人不受影响** —— 他们浏览器里存着上次的选择（localStorage 优先级更高）。
想立刻看到新默认：菜单里切一次语言，或 首选项 › 恢复默认设置。

已部署到 rhine.auak.dpdns.org。
MSG
echo "已提交："; git log --oneline -1
