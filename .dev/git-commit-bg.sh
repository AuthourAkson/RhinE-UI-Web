#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
修复播放列表右侧那块"浅灰区域"：DOM 面板缺少不透明底色

用户实测：曲目表里 ARTIST / TIME / POS 那几列下方有一大块浅灰，很突兀，原版没有。

定位过程（都做了数值验证）：
1. DOM 逐点 elementFromPoint + 计算样式 → 面板内所有元素（含 .prow）背景都是 rgba(0,0,0,0)；
2. 画布像素采样 → 播放列表面板自己的 canvas 也是全透明（0,0,0,0）；
3. 于是那块灰只能来自"面板后面"——主题的根面板（frame.js）画在下面的区域底板。
   面板内 2 倍裁图确认灰区正好是面板右半（ARTIST/TIME/POS 那几列所在的一侧）。

为什么原版没有：这块区域在原版是 **Columns UI 的原生 Playlist View**，是原生控件，
自带不透明背景，会把根面板的底板盖住。网页版这里是 DOM 面板（native/playlist.js），
只铺了行和文字、没有底色 → 底板直接透出来。

修法：给播放列表面板铺上主题的窗口底色（C.bg，来自先加载的 lib/core.js）：
    document.documentElement.style.background = css(C.bg);
    document.body.style.background = css(C.bg);

验证：
· 面板 html/body 计算背景 = rgb(11,11,11)，C.bg → rgba(11,11,11,1)
· 页面截图采样（原先的灰区）：1100,500 / 1100,700 / 700,500 / 400,500 / 1100,220
  全部 = 11,11,11（与面板底色一致）
· 五视图回归：全部出图、零报错；PLAY ALBUM 正常播放
MSG
echo "已提交："; git log --oneline -1
