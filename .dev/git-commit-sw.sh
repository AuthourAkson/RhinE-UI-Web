#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
Service Worker 离线缓存：第一次打开之后不再耗流量（断网也能开、能播）

背景（实测数据）：
  国内直连 Cloudflare 免费版共享 IP 的吞吐只有 ~30KB/s 且不稳定 ——
  同一 URL 相隔几分钟会在"12 秒超时"与"2.1 秒成功"之间反复；
  开场影片 145 帧 ≈14MB、demo 曲库 10MB，每次访问都要重下，体验上就是"加载不进去"。
  已用对照实验确认这与本次安全策略无关：关掉/开启我加的两条 WAF 规则，各项指标一致
  （而且与本站毫不相干的另一个 Cloudflare 站点 cdnjs.cloudflare.com 同样超时）。

实现：
  · sw.js（站点根目录，作用域 /）：
      - install  预缓存"壳"（51 个：HTML/app.js/shim/播放列表 + 主题全部 JS + 字体，约 1MB）
      - activate 清旧版本缓存 + clients.claim()
      - 导航        → 网络优先 + 6 秒超时 → 回退缓存（断网也能开）
      - 同源静态    → stale-while-revalidate（秒开 + 后台更新）
      - /musiclab/* → 缓存优先 + **自己实现 Range 切片**（<audio> 发的是 206；Cache API 只能存 200，
                      所以缓存里存整份、命中 Range 时切片返回，与服务端 Worker 同一套逻辑）
      - 其余同源 GET → 缓存优先（70MB 的 render 素材按需本地化）
      - message PRECACHE → 后台逐帧抓开场影片（一次一个，不抢首屏带宽，可断点续传）
  · build-static.mjs：生成 dist/sw-assets.json（壳 51 个 + 影片 144 帧，全部校验过在 dist 中存在），
      拷贝 sw.js，并给 /sw.js 与 /sw-assets.json 下发 no-cache（否则 SW 更新发不出去）。
      ⚠️ 影片帧只取**真正进了 dist** 的皮肤 —— 仓库有 10 套共 1440 帧，按仓库 glob 会全是 404。
  · app.js：https 下自动注册；本地 http 需 ?sw=1（避免污染开发循环）；缓存完成后在 HUD 提示。

顺手修的回归：我插 SW 代码时，一次编辑把注释与 `const pb = $('#pick-btn')` 挤到同一行，
  使该行变成注释 → main() 从此往后整段不执行（"选择本地目录"分支失效）。
  由 SW 探针的"断网阶段控制台错误 1 条"抓到，已修复并复测为 0。

验收（本地 + 线上各一遍，后者才是真实场景）：
  首访       shell/file 入缓存、sw active、controlled ✓；用量 14.3→16.7MB（含影片后台预取）
  播放一首   media=8（8 首 demo 全部本地化）✓
  断网重载   页面正常打开、10 面板 / 10 画布齐全 ✓
  断网播放   IsPlaying=true、曲长 209.7s、时间在走 ✓（Range 切片走通）
  控制台     **0 错误** ✓
MSG
echo "已提交："; git log --oneline -1
