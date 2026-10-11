#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修「选目录后同名 .lrc 不加载」+ 首选项滚动条跟随深色主题

一、选目录（File System Access）时同目录同名的 .lrc / .srt 歌词读不到
用户实测：手动选了 D:\AgentTestLab\RhinE-UI\musiclab，Mili - world.execute (me) ;.mp3
不加载它的 .lrc；而本地 ?demo=1 却正常 —— 看着"很奇怪"，其实是两条不同的取文件路径。

根因（两条叠加）：
 1) app.js 的 loadFsLibrary() 只收音频：
      else if (/\.(mp3|flac|m4a|…)$/i.test(name)) files.push(…)
    → .lrc 根本没被读进内存。
 2) File System Access **拿不到真实绝对路径**（浏览器不给），代码只能把路径拼成
      'D:\\' + rootName + p        // → D:\musiclab\…
    而清单的键是"仓库相对路径"（musiclab/…）→ 永远命不中 → utils.IsFile() 返回 false。

为什么本地 ?demo=1 正常：那条路走开发服务器，传的是**真实绝对路径**
（D:\AgentTestLab\RhinE-UI\musiclab\…），shim 的 norm() 剥掉清单 root 后正好等于清单键。

修法：给"用户自选目录"加一层同步覆盖层
 · 宿主扫目录时把同名文本（.lrc/.srt/.txt/.md）一起读进来，产出
     window.__RHINE_FS__ = { text: Map<拼出来的路径, 文本>, files: Set<拼出来的路径> }
 · shim 新增 fsOverlay()/fsHas()/fsGet()：同源 iframe 直接同步读父窗口属性
   （和 parent.__RHINE_CMD__ 同一路子），主题那些**同步**调用照常工作；
   IsFile / ReadTextFile 两个入口都先查它。反斜杠/正斜杠两种写法都试。

验证（假 DirectoryHandle，文件真的走 HTTP 读，等价于用户选目录）：
  宿主覆盖层 { files: 10, text: 2 }，键含 "D:\musiclab\Mili - world.execute (me) ;.lrc"
  utils.IsFile('D:\musiclab\Mili - world.execute (me) ;.lrc') → **true**（修复前 false）
  utils.ReadTextFile(同上) → **3849 字节**，首行 "[ar:Mili]"
  —— 而主题 lib/lyrics.js:51 的 loadLyrics() 第一步正是这两件事，链路即通。
  Mili 那首确认在播（时长 212s）；对照：military-radio 那首本来就没有 .lrc，
  报 "LRC FILE · NOT FOUND" 是**正确**行为。
已知同类缺口（未做）：选目录时同目录的 cover.jpg/folder.jpg 也无法解析（同一个原因，
  需要把图片做成 blob URL 并在 shim 的 d2d.Image 里映射）。

二、首选项对话框的滚动条：白底灰块太突兀
对话框画在**顶层文档**里，拿不到主题面板（iframe）的样式表，于是用了浏览器默认滚动条。
修法：wrap 加 color-scheme:dark（让 Chromium 把原生滚动条画成深色）+ 一段只作用于
  #rhine-prefs 的 ::-webkit-scrollbar 规则（透明轨道、rgba(242,241,236,.22) 圆角滑块、
  悬停变主题橙），样式表只挂一次不叠加。
验证：computed colorScheme = dark ✓、样式表存在 ✓、6 倍放大截图确认为深色轨道 + 柔和滑块 ✓。

另：五视图回归全绿、零报错；已重新部署到 rhine.auak.dpdns.org（3 个文件增量）。
MSG
echo "已提交："; git log --oneline -1
