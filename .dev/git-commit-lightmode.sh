#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修：切到浅色后播放列表下方仍是黑色（面板外壳只在加载时设了一次）

用户实测：播放列表页里曲目表下方那块（也就是我上次修掉"浅灰区域"的那片）切到 light 还是黑的。

根因：上次给它铺底色时是**加载时设一次**：
    document.body.style.background = css(C.bg);
而本文件的 on_colours_changed() 只做了 refreshTokens() + schedule()（C 确实更新了、
行也重画了），**外壳底色没再设一次** —— 于是它一直停在上一种模式的颜色。
滚动条滑块同理：写死 #55554f，浅色模式下也不对。

修法：把外壳（底色 + 滚动条规则）收进 paintChrome()，按当前 tokens 生成并**做缓存比对**，
在 render() 开头调用一次 —— 每次渲染都自动与当前模式校准：
    function cssRules() { … `::-webkit-scrollbar-thumb{background:${css(mix(C.fg, C.bg, .45))}}` … }
    function paintChrome() { const key = C.bg + "|" + C.fg + "|" + C.accent;
        if (key === chromeKey) return; chromeKey = key; …设底色 + styleEl.textContent = cssRules()… }
    function render() { paintChrome(); … }

验证（同一页面里切模式，逐面板读计算样式）：
  深色时 playlist 面板 html/body = rgb(11, 11, 11)
  执行 __RHINE_CMD__("mode:light") 后 → C.bg = #EEEDE7，
    playlist 面板 html/body = **rgb(238, 237, 231)** ✓（修复前会一直停在 rgb(11,11,11)）
  浅色整页截图：曲目表右侧/下方、左侧列表、卡片、工具条全部为浅色，行文字可读。
  五视图回归（深色）全绿、零报错；已部署到 rhine.auak.dpdns.org（2 个文件增量）。
MSG
echo "已提交："; git log --oneline -1
