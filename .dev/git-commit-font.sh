#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修复关键字发虚与中文被斜体：d2d.Font 的 style 第 0 位是**粗体**不是斜体

用户实测：网页版里很多关键字发虚不够清晰；中文还会被渲染成斜体。

主题自己的用法是权威依据（三处互相印证）：
  lib/tokens.js:74   d2d.Font(family, dp(size), weight >= 700 || (cjk && weight >= 600) ? 1 : 0)
  archive.js:577     a = Font("Geist Mono SemiBold", 15, 0)
                     b = Font("Geist Mono",          22, 1)   ← 同一处的"常规 / 粗体"两兄弟
  archive.js:599     topC = Font("Microsoft YaHei UI", 18, 1) ← CJK 只有单一字族，
                     粗体只能靠这个标志（家族名表达不了字重）
  archive.js:728-729 lipC = Font("Microsoft YaHei UI", 28, 1) / lip = Font("Geist Mono SemiBold", 30, 0)

而 shim 把它当成了斜体：
    Css: `${style & 1 ? 'italic ' : ''}${style & 2 ? '700 ' : '400 '}…`
→ 所有本该**粗体**的标签被渲染成"细体 + 浏览器伪斜体"：粗体丢了所以发虚，
  中文被伪斜体倾斜（用户看到的两个问题同源）。

修法（位映射交换）：
    const weight = (style & 1) ? 700 : 400;
    Css: `${(style & 2) ? 'italic ' : ''}${weight} ${size}px "${fam}", "Microsoft YaHei UI", sans-serif`
第 0 位 → font-weight:700；第 1 位 → italic（主题没有用过）。
"Geist Mono" 家族里同时注册了 Regular(400) 与 Bold(700) 两个真字体面
（FONT_FAMILY_BY_FILE 把 GeistMono-Bold 注册成 "Geist Mono" + weight 700），
所以 700 取到的是**真正的 Bold TTF**，不是合成加粗；CJK 走 Microsoft YaHei UI 的粗体面。

验证：
· Font('Geist Mono',22,0).Css = 400 22px；Font('Geist Mono',22,1).Css = **700** 22px
· Font('Microsoft YaHei UI',18,1) = **700** 18px（此前是 italic 400）
· document.fonts.check('700 22px "Geist Mono"') = true、('700 18px "Microsoft YaHei UI"') = true
· 标签位图分辨率正确：逻辑 54x13 → 后备 81x20（× dpr 1.5）
· 放大 3 倍核对：工具条 SHOW/ALBUMS/GENRE/ARTIST… 选中项是真粗体且清晰
· 放大 5 倍核对中文分组名「未知」：粗体正立（此前是伪斜体）
· 五视图回归：全部出图、零报错；PLAY ALBUM 正常播放
MSG
echo "已提交："; git log --oneline -1
