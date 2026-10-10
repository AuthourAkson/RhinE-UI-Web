#!/usr/bin/env bash
cd /d/AgentTestLab/RhinE-UI || exit 1
set -e
git commit -q -F - <<'MSG'
RhinE-UI：把 RhinE（An Audio Archive）主题移植到网页

主题原始 JS 一行未改（themes/audio-archive 与原版 1.4.0 逐字节一致），
移植层全部在宿主侧：

- app.js / panel.html：一个面板 = 一个 iframe，根面板按主题 frame.js
  的 regions() 用 Move/Show 摆位；NotifyOthers → postMessage 总线
- shim/shim.js：JSplitter → 浏览器适配层（d2d / gr Canvas2D / fb / plman /
  utils / window.DPI），include() 由服务器静态解析依赖图后按序插 <script>
- serve.mjs：零依赖静态服务器 + 清单（文本内联、图片尺寸扫文件头、依赖图）
- 媒体库：File System Access 选目录，或 ?demo=1 走 HTTP 演示通道；
  workers/ 里是真 Worker + 零依赖标签解析器（MP3 ID3v1/v2.2-2.4、FLAC、
  M4A、OGG、WAV，含内嵌封面）
- 播放：<audio> + 完整的 fb/plman 播放接口（含播放列表创建/装载，卡片
  PLAY ALBUM 链路可用）
- 设置：首次打开即原版参考状态（ALBUMS + GENRE 分组，选中首张专辑）

演示曲库与开发用 Chrome 配置不入库（见 .gitignore）。
MSG
echo "已提交："
git log --oneline -1
echo
echo "=== 仓库体积 ==="
git count-objects -vH | grep -E 'size-pack|count'
echo
echo "=== 提交文件数 ==="
git ls-files | wc -l
