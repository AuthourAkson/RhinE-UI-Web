#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q -F - <<'MSG'
SIGNAL 视图还原：实时频谱（管线脉冲流动）+ 整轨波形（signal trace）

主题这两个显示分别要 fb.GetAudioChunkTo 和 utils.GetWaveformAsync，此前都是空实现
（sound 视图因此完全静止、迹线永远是空的）。现在按它们的真实契约接上：

① fb.GetAudioChunkTo(chunk, seconds, flags, info) —— 实时分析
   父页面把 <audio> 接进 Web Audio：MediaElementSource → ChannelSplitter → 两个 AnalyserNode
   （真正的左右声道，所以 STEREO CORR 真实而不是恒定 1），同步填回**交错声道**的 Float32 样本，
   并把 SampleRate/ChannelCount 写进 info。主题随后自己做 2048 点 FFT → 48 个对数频段、
   峰值/RMS/相关性 → 驱动 ∞ 管线里的脉冲流动、48 段频谱带、PEAK/RMS/STEREO 读数。
   注意点：createMediaElementSource 会把音频接管进音频图，必须接回 destination，
   且在**用户手势时**就建图并 resume（否则上下文挂起 → 静音）；实测 48000Hz/2 声道。

② utils.GetWaveformAsync(handle, points, flags, x, onUpdate) —— 整轨波形
   面板内 fetch → decodeAudioData 整轨解码 → 按 points 个桶取绝对峰值 → 分批回调
   （回调返回 false 即取消，主题切换曲目时用它中断）→ 归一化后 resolve。
   缓存写到 <profile>\audio-archive-cache\waveform\ 的 JSON：这类缓存路径改走内存表，
   不再塞 localStorage（1024 个点 ≈5KB，一多就爆配额）；读不到时主题会自己重新解码。

顺带修掉三个阻塞/隐蔽的 bug：

1. 曲目句柄缺 GetFileInfo() —— 主题的 loadLyrics() 会调它，抛 TypeError 后
   npChanged() 在 waveLoad() **之前**中断 → 主题自己的波形加载永远走不到
   （症状：直接调 GetWaveformAsync 能出数据，但界面上的迹线一直是空的）。
   现在提供 MetaFind/MetaValueCount/MetaValue（+ MetaName/Info*），
   并预留 lyrics 字段：标签解析器将来支持内嵌歌词时会自动出现在这里。

2. Worker 桥：模块 worker 在**求值完成前**收到的 postMessage 会被丢掉
   （实测立即发收不到、延迟 1.2s 才收到），而主题的写法是 new Worker() 后立刻 postMessage
   → 媒体库时好时坏地永远解析不出来（曲库为空、播放列表 0 行、signal 没有数据）。
   现在把就绪前的消息排队，等 worker 第一次回话或 250ms 后补发。

3. fb.GetNowPlaying() 把 playing.item（播放列表项下标）当曲库曲目下标用
   （上次统一 focus 语义时漏掉的同一类错误），会返回"另一首"或 null。

验证（1707×899 CSS @dpr1.5，用户真实环境）：
· 播放中：live=true，活跃频段 32→33→36、能量 0.444→0.543→0.647、峰值 -12.9→-10 dB、
  立体声相关性 0.8~0.97（随曲目变化）
· Ring.pulses 每帧位置都不同（0.375/0.015/0.493… → 0.108/0.613/0.084…），
  surge>0.12 时生成新脉冲、脉冲数 6→7，模式 3d（预渲染环 + 流动脉冲）
· 主题那条链：Wave.key=81ce7a57、Wave.loaded=1024、max=1（归一化完成）
· SIGNAL TRACE 画出整轨包络 + 播放头 + 00:05/00:08 读数
· 五视图回归：全部出图、零报错
MSG
echo "已提交："
git log --oneline -1
