# RhinE-UI —— 把 RhinE 主题移植到网页（里程碑 1：外壳跑通）

把 foobar2000 的 **RhinE — An Audio Archive** 主题（MIT）搬到浏览器里，**主题原始 JS 一行未改**。

```
D:\AgentTestLab\RhinE-UI\
├── index.html          宿主页面（扮演 Columns UI 的面板容器）
├── app.js              面板容器：建 iframe、转发总线、传递清单
├── panel.html          单个面板的页面（加载 shim）
├── serve.mjs           零依赖静态服务器 + 清单生成（含图片尺寸扫描、依赖图解析）
├── shim/shim.js        JSplitter → 浏览器 适配层（d2d / gr / fb / plman / utils / window）
├── workers/            真 Web Worker：曲库索引 + 零依赖标签解析器（tags.js）
├── themes/audio-archive/   主题副本（js/ tokens/ columns/ assets/{fonts,render,intro}）
├── audio-archive-settings.json  首次打开的默认设置（= 原版参考状态：ALBUMS + GENRE 分组）
└── .dev/               开发用探针与诊断脚本（探针、canvas 导出、布局像素对比）
```

> **演示曲库不含在仓库里**：`.dev/music/` 里的音频有版权，已被 `.gitignore` 排除。
> 想用 `?demo=1` 自测，自己往 `.dev/music/` 放几首音频（或用 `.dev/make-fixtures.sh` 造测试专辑）；
> 正常用法是在页面上点 `+ ADD MUSIC FOLDER` 选自己的音乐目录。

## 跑起来

```bash
cd /d/AgentTestLab/RhinE-UI
node serve.mjs 8300          # 然后浏览器打开 http://127.0.0.1:8300/
```

> 必须用 HTTP 服务打开（`file://` 下浏览器不允许 fetch / 字体加载）。
> 键盘 `1`–`5` 切换五个视图（档案 / 播放列表 / 歌词 / 信号 / 外观），`T` 切浅色深色 —— 都是主题自己的命令。

## 原始架构 → 网页版的对应关系

| foobar2000 / Columns UI / JSplitter | 网页版 |
|---|---|
| foobar2000 进程 + 媒体库 + 播放 | （待实现：Web Audio + File System Access + IndexedDB） |
| Columns UI 面板容器 | `app.js`：绝对定位的 iframe 列表 |
| 一个 JSplitter 子面板 | 一个 `<iframe>`（各自独立全局作用域） |
| 根面板 `frame.js` 用 `GetPanelByIndex(i).Move/Show` 摆位 | 同名 API → 改 iframe 的几何 |
| `window.NotifyOthers(name, json)` | postMessage 总线（父页面转发到其余面板） |
| `include()` 同步加载模块 | 服务器静态解析依赖图 → 按序插入 `<script>`（经典脚本共享全局词法作用域） |
| `utils.ReadTextFile()` | 清单里内联了全部 js/json |
| `d2d.Image().Width` | 服务器扫描 PNG/JPEG 文件头，尺寸立即就有；像素异步加载 |
| `gr.*`（Direct2D 绘制） | Canvas2D 实现（22 个方法） |

## 移植路上踩的 5 个坑（都已修好）

1. **严格模式下 eval 的声明不进全局** —— 主题每个文件都以 `"use strict"` 开头，用 `(0,eval)` 实现 `include()`
   会让 `getSetting` 之类的函数互相看不见（`ReferenceError`）。改成真正的 `<script>` 标签按依赖顺序加载。
2. **`Object.assign(window, shim)` 的返回值不能再赋回 `window.window`** —— 它是只读 getter，直接抛
   `Cannot set property window which has only a getter`。
3. **Canvas2D 的裁剪不能用 `setTransform` 撤销** —— 必须 `save()/restore()`。这个 bug 的症状极具迷惑性：
   header 的徽标（在裁剪区内）正常显示，而同一面板里裁剪区之外的**所有文字都消失**。
4. **依赖图要按源码顺序展开** —— 分两趟收集会把 `for (const f of [...]) include(...)` 排到最后，
   导致 `archive.js` 先于它依赖的 `library.js` 执行（`LIB_LISTENERS is not defined`）。
5. **面板层级** —— 根面板必须在所有子面板**之下**（它只负责露出的缝隙），否则整页被它盖住。

## 当前状态

**已通**：10 个面板全部启动、零报错；**启动自动播放开场影片**；顶栏 / 播放列表管理器 / 面板头 /
SIGNAL PROFILE 卡片 / 底部传输栏；键盘切换视图；**浅色深色切换**；**配色方案切换**（5 套）；
**外观视图**（10 套外壳卡片、FLOOR、比例）；设置持久化。

**媒体库与播放（本轮新增）**：
- **媒体库**：File System Access 选目录（`+ ADD MUSIC FOLDER` / `Library › Configure`），
  或 `?demo=1` 走开发服务器的 HTTP 曲库（自测用）
- **真 Web Worker 解析**：`workers/library-web.js` + `workers/tags.js`（零依赖标签解析器，
  支持 MP3 ID3v1/v2.2/v2.3/v2.4、FLAC、M4A、OGG、WAV + 内嵌封面）
- **专辑/曲目模型与原版完全一致**：`buildAlbums()` 是从原版 worker 照搬的算法，
  只把 `fb.TitleFormat` 取字段换成标签解析（18 个字段同序）
- **封面**：内嵌图片 → OffscreenCanvas 方形裁剪 → 256px 缩略图 + 48px 模糊版 → ImageBitmap 传给面板
- **播放**：`<audio>` + 传输栏；主题侧 `fb.IsPlaying / PlaybackTime / PlaybackLength / GetNowPlaying /
  PlayOrPause / Next / Prev / Volume`（含 setter）全部接真实值；`plman.*` 接真实播放列表
- **原生播放列表（02 PLAYLISTS 视图）**：`native/playlist.js` 用 DOM 复刻 Columns UI 的 Playlist View ——
  列宽/列格式取自主题自己的 `columns/preset-*.json` 与 `.fcl` 预设，与 head 面板画的列标题逐像素对齐；
  ALBUM/INDEX 两套预设、分组头、正在播放行整行橙色、单击选择 / Shift 范围 / Ctrl 切换 / 双击播放 /
  方向键与 PageUp·Down、右键菜单、点列标题排序、双击重命名、头部统计（曲目数 · 总时长 · 总体积）
- **SIGNAL 视图（04）的真实现场**：
  · 实时频谱 `fb.GetAudioChunkTo` —— 父页面把 `<audio>` 接进 Web Audio
    （MediaElementSource → ChannelSplitter → 两个 AnalyserNode），同步填回**交错声道**的 Float32 PCM，
    主题自己做 2048 点 FFT、48 个对数频段、峰值/RMS/立体声相关性 → ∞ 管线里的脉冲流动 + 频谱带
  · 整轨波形 `utils.GetWaveformAsync` —— 面板内 `decodeAudioData` 整轨解码，按 1024 个桶取绝对峰值，
    分批回调（可取消）并归一化 → 下方 SIGNAL TRACE 波形 + 播放头
- 实测：6 首 / 3 张专辑解析 **~20ms**；档案视图货架显示真实封面，
  卡片显示 `Test Album Two · ANOTHER ARTIST · 2023 / 02 TRACKS / 00:14 · FLAC 16/44.1` + 曲目行 `01 Alpha 00:08`

**未做**（后续）：
- 曲库缓存（IndexedDB）——现在是每次启动重新解析，目录句柄也还没持久化
- 歌词（在线 LRCLIB + 内嵌）：内嵌歌词还差标签解析器提取 USLT/LYRICS；在线那条要接 `DownloadFileAsync`
- 顶栏 MENU 里 foobar2000 的原生菜单项（网页版没有对应物，只保证不崩）
- 整库随机（`S`）需要 `plman.InsertPlaylistItemsFilter` 等播放列表编辑接口

## 开发/自测工具（`.dev/`）

| 脚本 | 用途 |
|---|---|
| `serve` 里的 `/__music.json` | 把 `.dev/music` 下的素材列成曲库（配合 `?demo=1`） |
| `make-fixtures.sh` | 用 ffmpeg 造带标签+封面的测试专辑 |
| `test-tags.mjs` | 标签解析器测试（995 项断言） |
| `console-log.mjs` | **订阅浏览器控制台**（含 worker 错误）——排查"没反应"类问题的利器 |
| `dump-canvas.mjs` / `repaint-lab.mjs` | 把某个面板的 canvas 导出来看（绕开合成器） |
| `lib-state.js` / `lib-debug.js` | 曲库状态、catalog 是否到达 |
| `click-test.sh` / `play-test.sh` | 真实鼠标点击 / 播放链路验证 |

