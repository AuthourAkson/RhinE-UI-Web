#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
宿主界面文案跟随主题的界面语言（首选项 / HUD 按钮 / 状态行）

用户实测："切换语言后里面还是中文" —— 上一版加的「网页版首选项」文案是写死中文的，
HUD 上的「拾取元素 / 隐藏」和底部状态行的 log() 也都不跟随语言。

做法：宿主加一套与主题 lib/i18n.js **完全同约定**的小词典 ——
英文原文即 key，缺翻译就保持英文；当前语言从设置文件 audio-archive-settings.json 的
uiLang 读，没有设置时按系统语言推断（与主题的 systemLang() 同一规则）：
    const HOST_LANGS = ['en', 'zh-CN', 'ja'];
    function hostLang() { …读 uiLang → 否则系统语言… }
    function ht(s, ...args) { …查表，缺则英文原文… }

改到的位置：
· 网页版首选项的全部文案（分区标题 / 标签 / 按钮 / 快捷键说明 / 关于项 / confirm 与日志）
· HUD 两个按钮（index.html 里是静态中文，加 id 后由 applyHostLang() 按语言改写，
  main() 启动时调用一次，打开首选项时再调一次）
· 底部状态行里面向用户的 log()（媒体库就绪 / 曲库解析完成 / 播放 / 扫描 / 设置 / 缓存 /
  模式与配色 / 播放列表编辑共 18 条）
· 数值本身保持语言中立（例如 "7 / 2"、"05:03 / 10.8 MB"），只有标签需要翻译

另外把首选项标题设成 nowrap：英文下 "PREFERENCES · Web preferences" 会折行。

验证（同一份页面，只改 uiLang 后重载）：
  en    → HUD: Pick element / Hide；状态行: Opened the web preferences；
          首选项: PREFERENCES · Web preferences / Library / MEDIA LIBRARY / Source
                  Demo library (?demo=1) / Choose music folder… / Rescan / Load demo library
  zh-CN → HUD: 拾取元素 / 隐藏；状态行: 打开网页版首选项；
          首选项: PREFERENCES · 网页版首选项 / 曲库 / 来源 演示曲库（?demo=1）/ 选音乐文件夹…
MSG
echo "已提交："; git log --oneline -1
