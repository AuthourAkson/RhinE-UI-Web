/**
 * shim.js —— JSplitter → 浏览器 适配层（运行在每个面板 iframe 内）
 *
 * 目标：让主题原封不动的 JS（js/*.js、js/lib/*.js）在浏览器里跑起来。
 * 每个面板一个 iframe ＝ JSplitter 里的一个子面板，各自一份全局作用域。
 *
 * 必须解决的三个"同步 API"问题（浏览器天生做不到的四件事）：
 *   1) include(path)          —— 主题在顶层同步加载模块 → 用**间接 eval**注入该 iframe 的全局词法作用域
 *   2) utils.ReadTextFile()   —— 同步读文本 → 服务器清单已内联全部 js/json，直接查表
 *   3) d2d.Image().Width      —— 同步拿图片尺寸 → 服务器清单已扫描 PNG/JPEG 文件头，像素再异步加载
 *   4) utils.LoadFont()       —— 同步装字体 → 父页面在启动前把 5 个 Geist Mono 全部 await 加载完
 */
(function () {
  'use strict';

  /* ==================================================== 早期错误捕获 -- */
  // 面板脚本的异常必须让父页面看见（否则只会沉在 iframe 控制台里）
  let BOOT_CFG = null;
  function rawReport(type, data) {
    try { parent.postMessage({ __rhine: 1, id: (BOOT_CFG && BOOT_CFG.id) || 'unknown', type, data }, '*'); }
    catch (e) { /* ignore */ }
  }
  window.onerror = function (msg, src, line, col, err) {
    rawReport('error', { phase: 'window.onerror', message: `${msg} @${String(src).split('/').pop()}:${line}:${col}`, stack: err && err.stack });
    return false;
  };
  window.addEventListener('unhandledrejection', (e) => {
    rawReport('error', { phase: 'unhandledrejection', message: String(e.reason && e.reason.stack || e.reason) });
  });
  const origError = console.error.bind(console);
  console.error = function (...args) {
    origError(...args);
    rawReport('log', { level: 'error', message: args.map((a) => (a && a.stack) || String(a)).join(' ').slice(0, 600) });
  };

  /* ============================================================ 常量 / 工具 -- */

  const DT = {
    LEFT: 0x00000000, CENTER: 0x00000001, RIGHT: 0x00000002, VCENTER: 0x00000004,
    WORDBREAK: 0x00000010, SINGLELINE: 0x00000020, NOPREFIX: 0x00000800,
    ENDELLIPSIS: 0x00008000, PATH_ELLIPSIS: 0x00004000, WORD_ELLIPSIS: 0x00008000,
  };
  const MK = { LBUTTON: 0x0001, RBUTTON: 0x0002, SHIFT: 0x0004, CONTROL: 0x0008, MBUTTON: 0x0010 };

  const toCss = (c) => `rgba(${(c >>> 16) & 255},${(c >>> 8) & 255},${c & 255},${(((c >>> 24) & 255) / 255).toFixed(4)})`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /** 路径归一化：反斜杠 → 正斜杠、去掉前导斜杠，并把**项目根前缀**剥掉。
   *  ⚠️ 后一步很关键：主题按 fb2k 的完整路径去找 sidecar 文件 —— 例如
   *  lib/lyrics.js:57 把 `D:\…\musiclab\某曲.mp3` 换成 `.lrc` 再问 utils.IsFile()，
   *  而清单（manifest.text）的键是**相对仓库根**的（`musiclab/某曲.lrc`）。
   *  不剥前缀就永远查不到，表现为"放了 .lrc 也不显示歌词"。
   *  root 由服务端在 /__manifest.json 里给出（构建时赋值给 MANIFEST）。 */
  const norm = (p) => {
    let s = String(p == null ? '' : p).replace(/\\/g, '/');
    const root = (MANIFEST && MANIFEST.root) || (typeof window !== 'undefined' && window.__RHINE_ROOT__) || '';
    if (root && s.toLowerCase().startsWith(String(root).toLowerCase())) s = s.slice(String(root).length);
    return s.replace(/^\/+/, '');
  };

  let CFG = null, MANIFEST = null, CANVAS = null, CTX = null, DPR = 1;
  // 版本标记：面板里跑的是哪一版 shim，一查就知道（排查缓存问题用）
  window.__RHINE_SHIM__ = 'v5-picker';
  // ⚠️ 必须在覆盖 window.Worker 之前抓住原生构造函数：
  //    下面的桥会把 window.Worker 换成自己的实现，若桥内部再写 `new Worker(...)` 就会无限递归
  //    （实测报 RangeError: Maximum call stack size exceeded）
  const NativeWorker = window.Worker;
  let W = 0, H = 0, dirty = true, dirtyAll = true, rafPending = false;
  const timers = new Map();
  const imageCache = new Map();
  let HANDLERS = {};

  /** ImageBitmap → 本 shim 的图片句柄（Canvas2D 的 drawImage 直接接受 ImageBitmap） */
  function bitmapHandle(bmp) {
    if (!bmp) return null;
    return { __el: bmp, __ready: true, __image: true, __bitmap: true, Width: bmp.width, Height: bmp.height };
  }

  const workingWorkers = [];   // 本面板创建的库 worker（供 libraryReady() 冲掉排队的索引请求）

  /* ============================================================== 绘制对象 -- */

  const BASE_D = new WeakMap();   // 每个绘图上下文的基准缩放（主画布 = DPR，CreateImage 的层 = 它自己的 DPR）

  function makeGr(ctx, owner) {
    const stack = [];
    // 该上下文自己的"基准变换"：主画布 = DPR 缩放（主题按 CSS px 画，画布后备是 W×DPR），
    // CreateImage 的离屏层 = 单位矩阵（就是按设备像素 1:1 画）。
    //
    // ⚠️⚠️ SetTransform / ResetTransform 必须回到**这个基准**，不能回到单位矩阵：
    //    主题的 quadImage / drawSpineLabel / drawTopTitle / renderLayer 都是
    //    "SetTransform(仿射矩阵) → DrawImage/DrawText → ResetTransform" 的写法。
    //    一旦重置成单位矩阵，DPR≠1（例如 Windows 150% 缩放、dpr=1.5）时，
    //    这些内容的坐标就被当成设备像素 → 整体缩到 1/DPR 倍并错位：
    //    实测症状正是"封面四边形/标题条/脊标比磁带外壳小 2/3 并飘在半空"。
    //    在 dpr=1 的窗口里两者等价，所以本地看永远正常 —— 必须按 dpr≠1 验证。
    const baseScale = () => (owner === CANVAS ? DPR : (BASE_D.get(ctx) || 1));
    const applyBase = () => { const d = baseScale(); ctx.setTransform(d, 0, 0, d, 0, 0); };
    const g = {
      /* --- 填充 / 描边 --- */
      FillSolidRect(x, y, w, h, colour) {
        ctx.fillStyle = toCss(colour >>> 0);
        ctx.fillRect(x, y, w, h);
      },
      DrawRect(x, y, w, h, lineWidth, colour) {
        ctx.strokeStyle = toCss(colour >>> 0); ctx.lineWidth = lineWidth || 1;
        ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, w - lineWidth, h - lineWidth);
      },
      DrawLine(x1, y1, x2, y2, lineWidth, colour) {
        ctx.strokeStyle = toCss(colour >>> 0); ctx.lineWidth = lineWidth || 1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      },
      DrawLines(points, lineWidth, colour) {
        if (!points || points.length < 4) return;
        ctx.strokeStyle = toCss(colour >>> 0); ctx.lineWidth = lineWidth || 1;
        ctx.beginPath(); ctx.moveTo(points[0], points[1]);
        for (let i = 2; i + 1 < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
        ctx.stroke();
      },
      FillPolygon(colour, fillMode, points) {
        if (!points || points.length < 6) return;
        ctx.fillStyle = toCss(colour >>> 0);
        ctx.beginPath(); ctx.moveTo(points[0], points[1]);
        for (let i = 2; i + 1 < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
        ctx.closePath(); ctx.fill(fillMode === 1 ? 'evenodd' : 'nonzero');
      },
      DrawPolygon(colour, lineWidth, points) {
        if (!points || points.length < 6) return;
        ctx.strokeStyle = toCss(colour >>> 0); ctx.lineWidth = lineWidth || 1;
        ctx.beginPath(); ctx.moveTo(points[0], points[1]);
        for (let i = 2; i + 1 < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
        ctx.closePath(); ctx.stroke();
      },
      FillEllipse(x, y, w, h, colour) {
        ctx.fillStyle = toCss(colour >>> 0);
        ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2); ctx.fill();
      },
      DrawEllipse(x, y, w, h, lineWidth, colour) {
        ctx.strokeStyle = toCss(colour >>> 0); ctx.lineWidth = lineWidth || 1;
        ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2 - lineWidth / 2, Math.abs(h) / 2 - lineWidth / 2, 0, 0, Math.PI * 2); ctx.stroke();
      },
      FillGradRect(x, y, w, h, angleDeg, c1, c2, focus) {
        // D2D 的 angle 从 +x 轴**顺时针**（屏幕 y 向下）：0° = 左→右，90° = 上→下，
        // c1 在起点、c2 在终点。主题就是这么用的：
        //   archive.js:649  0°,  透明→bg   阵列向右侧卡片淡出
        //   archive.js:650  90°, 透明→bg   阵列底部的黑带向下淡出（播放栏上方那条）
        //   grid.js:183     90°, bg→透明   网格内容自上而下淡入
        // 跨度必须是"矩形在该方向上的投影" |w·cos| + |h·sin|：
        //   旧实现用 max(w, h) 当跨度，那条 aw×80dp 的带子会拿到 1074px 的跨度，
        //   只用到整条渐变的 7%，画出来几乎是一块纯色 —— 看起来"只透明、没渐变"。
        const a = (angleDeg || 0) * Math.PI / 180;
        const cx = x + w / 2, cy = y + h / 2;
        const span = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
        const dx = Math.cos(a) * span / 2, dy = Math.sin(a) * span / 2;
        const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
        grad.addColorStop(0, toCss(c1 >>> 0));
        grad.addColorStop(focus != null ? clamp(focus, 0, 1) : 1, toCss(c2 >>> 0));
        ctx.fillStyle = grad; ctx.fillRect(x, y, w, h);
      },

      /* --- 文字 --- */
      DrawText(text, font, colour, x, y, w, h, flags) {
        drawTextImpl(ctx, String(text), font, colour, x, y, w, h, flags, false);
      },
      DrawStrokedText(text, font, colour, strokeWidth, x, y, w, h, flags) {
        drawTextImpl(ctx, String(text), font, colour, x, y, w, h, flags, strokeWidth || 1);
      },
      CalcTextWidth(text, font, fromZero) {
        ctx.save(); ctx.font = fontCssOf(font); const m = ctx.measureText(String(text)); ctx.restore();
        // ⚠️ fromZero=true 用来算**逐字形的框宽**（lib/text.js:53-62 把每个字形画进
        //    adv[i] + dp(4) 的框，位图总宽 = Σ步进 + 字距）。这里必须取"步进"与"墨迹右缘"
        //    的较大者：
        //      · 取步进 → 等宽字体的窄字形（冒号等）推进正确，时钟不会挤在一起；
        //      · 取墨迹右缘 → 斜体/合成斜体（GeistMono 没有 italic 面，浏览器会把正体倾斜）
        //        的墨迹会超出步进，只按步进算宽会让**最后一个字形**超出位图被裁掉
        //        （实测：UNKNOWN 末字超出 1.7px、开场 SESSION AUTHORIZED 超出 3.0px，
        //         用户看到"最后一个字母被遮住一小部分"）。
        //    两者取大既保住推进、又保证框容得下墨迹。
        return Math.max(m.width || 0, m.actualBoundingBoxRight || 0);
      },
      CalcTextHeight(text, font) {
        ctx.save(); ctx.font = font.Css; const m = ctx.measureText(String(text)); ctx.restore();
        return (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || font.Height;
      },
      EstimateLineWrap(text, font, maxWidth) {
        ctx.save(); ctx.font = font.Css;
        const words = String(text).split(/(\s+)/);
        const out = []; let line = '';
        for (const word of words) {
          const t = line + word;
          if (line && ctx.measureText(t).width > maxWidth) { out.push(line.replace(/\s+$/, ''), ctx.measureText(line.replace(/\s+$/, '')).width); line = word.replace(/^\s+/, ''); }
          else line = t;
        }
        if (line) out.push(line, ctx.measureText(line).width);
        ctx.restore();
        return out;
      },

      /* --- 图像 --- */
      DrawImage(img, dx, dy, dw, dh, sx, sy, sw, sh, angle, alpha) {
        const el = img && img.__el ? img.__el : img;
        if (!el || !img.__ready) return;
        const prevAlpha = ctx.globalAlpha;
        if (alpha != null) ctx.globalAlpha = prevAlpha * clamp(alpha, 0, 1);
        // 源矩形以"逻辑像素"给出（img.Width/Height 也是逻辑值）：CreateImage 的层后备被放大了
        // __dpr 倍，所以源坐标要乘回去，否则会只取到左上角 1/__dpr（实测症状：淡出色卡只剩一角）
        const sd = img.__dpr || 1;
        const rx = (sx || 0) * sd, ry = (sy || 0) * sd, rw = (sw || img.Width) * sd, rh = (sh || img.Height) * sd;
        // ⚠️⚠️ 吸附到**设备像素网格**：主题的标签是画进位图再整张贴回来的，而它多数位置只
        //    Math.round 到整数 CSS px。dpr = 1.5 时，**奇数** CSS 坐标 × 1.5 落在半设备像素上
        //    → 整张位图被重采样 → 文字发虚（约一半的标签中招，用户反馈"很多关键字不够清晰"；
        //    1× 屏上也看不出来，所以只有高分屏缩放才有）。把目标位置与尺寸吸附到 1/dpr 网格后，
        //    位图与画布设备像素一一对应，笔画就是硬的（最多移动 0.33 CSS px，肉眼不可见）。
        if (!angle && DPR > 1) {
          const q = (v) => Math.round(v * DPR) / DPR;
          dx = q(dx); dy = q(dy); dw = q(dw); dh = q(dh);
        }
        ctx.save();
        if (angle) {   // D2D 的角度是"弧度"（正数顺时针），绕目标矩形中心
          ctx.translate(dx + dw / 2, dy + dh / 2); ctx.rotate(angle); ctx.translate(-dw / 2, -dh / 2);
          ctx.drawImage(el, rx, ry, rw, rh, 0, 0, dw, dh);
        } else {
          ctx.drawImage(el, rx, ry, rw, rh, dx, dy, dw, dh);
        }
        ctx.restore();
        ctx.globalAlpha = prevAlpha;
      },
      DrawEffect(fx, x, y, w, h, srcW, srcH) {
        if (!fx || !fx.__input || !fx.__input.__ready) return;
        const dw = w || srcW || fx.__input.Width, dh = h || srcH || fx.__input.Height;
        const src = sourceCanvas(fx.__input);
        // ⚠️⚠️ 主题的两处 Effect 都是 **5×4 颜色矩阵**，不是色相滤镜：
        //   archive.js tinted()  把 frost 按 f 向背景色淡出（k=1-f 缩放 + r*f,g*f,b*f 偏移）
        //   draw.js   hueMatrix() 配色方案的色相旋转（同一套矩阵机制）
        // 之前我把它当成色相旋转、用 CSS hue-rotate 近似 —— 于是 tinted() 的 10 个 f 档位
        // 渲染出来**完全一样** → 选中磁带时不是"逐渐虚化"，而是最后一帧直接切成 clear，
        // 看着就是"磁带画面中间突然变色"（用户实测）。现在逐像素按矩阵算。
        const img = (fx.__m && src) ? colourMatrix(src, fx.__m) : src;
        if (!img) return;
        ctx.drawImage(img, 0, 0, img.width, img.height, x, y, dw, dh);
      },

      /* --- 裁剪 / 变换 --- */
      // ⚠️ Canvas2D 的裁剪区不能靠 setTransform 撤销，必须用 save()/restore()。
      // 之前只回滚变换，导致 PopClip 之后裁剪仍在生效——实测症状是"徽标能画出来、但同一面板里
      // 裁剪区之外的文字全都不显示"（header 用 PushClip 把徽标裁在白色底板内）。
      PushClip(x, y, w, h) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); stack.push(1); },
      PopClip() { if (stack.length) { stack.pop(); ctx.restore(); } },
      PushTransform(m) { ctx.save(); if (m) applyMatrix(ctx, m); stack.push(1); },
      PopTransform() { if (stack.length) { stack.pop(); ctx.restore(); } },
      SetTransform(m) { applyBase(); applyMatrix(ctx, m); },
      ResetTransform() { applyBase(); },
      Translate(x, y) { ctx.translate(x, y); },
      Scale(sx, sy, cx, cy) { if (cx != null) ctx.translate(cx, cy); ctx.scale(sx, sy); if (cx != null) ctx.translate(-cx, -cy); },
      SetSmoothingMode(m) { ctx.imageSmoothingEnabled = m !== 0; },
      SetInterpolationMode() { },
      SetTextRenderingHint() { },
      SetCompositingMode(m) { ctx.globalCompositeOperation = m === 1 ? 'source-copy' : 'source-over'; },
      MeasureText: null,
    };
    g.MeasureText = g.CalcTextWidth;
    return g;
  }

  function applyMatrix(ctx, m) {
    // JSplitter 的矩阵是 3×2：[m11, m12, m21, m22, dx, dy]
    if (Array.isArray(m) || ArrayBuffer.isView(m)) {
      if (m.length >= 6) ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      else if (m.length >= 4) ctx.transform(m[0], m[1], m[2], m[3], 0, 0);
    }
  }

  function fontCssOf(font) { return font && font.Css ? font.Css : '10px "Geist Mono", monospace'; }

  function drawTextImpl(ctx, text, font, colour, x, y, w, h, flags, strokeW) {
    flags = flags | 0;
    ctx.save();
    ctx.font = fontCssOf(font);
    ctx.fillStyle = toCss(colour >>> 0);
    ctx.strokeStyle = toCss(colour >>> 0);
    ctx.textBaseline = 'alphabetic';
    const single = !!(flags & DT.SINGLELINE) || !(flags & DT.WORDBREAK);
    let txt = text;
    if (flags & DT.NOPREFIX) txt = txt.replace(/&/g, '');
    // 对齐
    let tx = x;
    const align = (flags & DT.CENTER) ? 'center' : (flags & DT.RIGHT) ? 'right' : 'left';
    ctx.textAlign = align;
    if (align === 'center') tx = x + w / 2; else if (align === 'right') tx = x + w;
    // 垂直：D2D 的单行是"在矩形里居中"
    let ty;
    if (flags & DT.VCENTER) { ctx.textBaseline = 'middle'; ty = y + h / 2; }
    else { ctx.textBaseline = 'alphabetic'; ty = y + (font.Ascent || font.Height * 0.8); }
    // 省略号
    if (flags & 0x00008000 && w > 0) {
      const full = ctx.measureText(txt).width;
      if (full > Math.abs(w)) {
        const ell = '…';
        let lo = 0, hi = txt.length;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(txt.slice(0, mid) + ell).width <= Math.abs(w)) lo = mid; else hi = mid - 1; }
        txt = txt.slice(0, lo) + ell;
      }
    }
    // ⚠️ 绝不能给 fillText/strokeText 传第 4 个参数（maxWidth）：宽度不够时浏览器会把
    //    整行字**横向压缩**，字形互相挤压。Direct2D 的处理是裁掉/省略，不是压扁。
    //    省略号已由上面的 DT_ELLIPSIS 分支自己裁好，这里不再压字。
    if (strokeW) { ctx.lineWidth = strokeW; ctx.strokeText(txt, tx, ty); }
    ctx.fillText(txt, tx, ty);
    ctx.restore();
  }

  /* ================================================================== d2d -- */

  const FONT_FAMILY_BY_FILE = {
    Light: 'Geist Mono Light', Regular: 'Geist Mono', Medium: 'Geist Mono Medium',
    SemiBold: 'Geist Mono SemiBold', Bold: 'Geist Mono',
  };
  const FONT_WEIGHT_BY_FILE = { Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700 };

  let measureCtx = null;
  const measure = () => (measureCtx ??= document.createElement('canvas').getContext('2d'));

  const d2d = {
    Font(family, sizePx, style) {
      const fam = family || 'Geist Mono';
      const size = Math.max(1, sizePx || 10);
      // ⚠️⚠️ style 的**第 0 位是"粗体"**，不是斜体 —— 主题自己的用法是权威依据：
      //   lib/tokens.js:74  d2d.Font(family, size, weight >= 700 || (cjk && weight >= 600) ? 1 : 0)
      //   archive.js:577    a = Font("Geist Mono SemiBold", 15, 0)   b = Font("Geist Mono", 22, 1)
      //                     ↑ 同一处的"常规 / 粗体"两兄弟：粗体只能来自第 0 位
      //   archive.js:599    topC = Font("Microsoft YaHei UI", 18, 1)  ← CJK 只有单一字族，
      //                     粗体同样只能靠这个标志
      // 之前我把第 0 位当成斜体 → 所有本该**粗体**的标签被渲染成又细又斜的伪斜体：
      // 看着发虚（粗体丢了），中文还会被浏览器做伪斜体（用户实测的"模糊"与"中文变斜体"同源）。
      // 现在第 0 位 → font-weight:700（"Geist Mono" 家族里同时注册了 Regular 400 与 Bold 700，
      // 所以取到的是**真正的粗体 TTF**，不是合成加粗）；第 1 位 → italic（主题没用过）。
      const weight = (style & 1) ? 700 : 400;
      const f = {
        Family: fam, Size: size, Style: style | 0,
        Css: `${(style & 2) ? 'italic ' : ''}${weight} ${size}px "${fam}", "Microsoft YaHei UI", sans-serif`,
      };
      const m = measure(); m.save(); m.font = f.Css;
      const tm = m.measureText('Mg');
      f.Height = Math.ceil(tm.fontBoundingBoxAscent != null
        ? tm.fontBoundingBoxAscent + tm.fontBoundingBoxDescent
        : size * 1.32);
      f.Ascent = Math.ceil(tm.fontBoundingBoxAscent != null ? tm.fontBoundingBoxAscent : size * 1.06);
      m.restore();
      return f;
    },
    Image(path) { return imageFor(norm(path)); },
    CreateImage(w, h) {
      // 逻辑尺寸 w×h，后备画布按 DPR 放大 + 基准变换 = DPR：
      // 这样 renderLayer() 里按 CSS px 画出来的资料卡在 150% 缩放下依然清晰
      // （否则后备只有 1×，回贴时被放大 1.5 倍 → 糊）。
      // 图像句柄的 Width/Height 仍是逻辑值，DrawImage 会按 __dpr 换算源矩形。
      const d = window.devicePixelRatio || 1;
      const cv = document.createElement('canvas');
      const lw = Math.max(1, Math.round(w)), lh = Math.max(1, Math.round(h));
      cv.width = Math.max(1, Math.round(lw * d)); cv.height = Math.max(1, Math.round(lh * d));
      return makeImageHandle(cv, lw, lh, d);
    },
    LoadImageAsyncV(path, onDone) { const img = imageFor(norm(path)); queueMicrotask(() => onDone && onDone(img)); return img; },
    // ⚠️ 主题实际用的是这个名字（带数字后缀，我第一次枚举 API 时用 [A-Za-z_] 漏掉了它）：
    //     d2d.LoadImageAsyncV2(0, path).then(img => …)，第一个参数是占位，返回 Promise
    LoadImageAsyncV2(_unused, path) { return imageReady(norm(path)); },
    LoadImageAsync(path, onDone) { const img = imageFor(norm(path)); queueMicrotask(() => onDone && onDone(img)); return img; },
    Effect(clsid) {
      const fx = { Clsid: String(clsid || '').toUpperCase(), __input: null, __m: null, values: {} };
      fx.SetValue = (i, v) => {
        fx.values[i] = v;
        if (i === 0 && v && v.length >= 20) fx.__m = v;
      };
      fx.SetInput = (i, img) => { if (i === 0) fx.__input = img; };
      fx.SetInputCount = () => { };
      fx.SetOutputRect = () => { };
      return fx;
    },
    Brush(kind, img, opacity) {
      return { Kind: kind, Image: img, Opacity: opacity, __brush: true, __kind: kind, __img: img };
    },
    StrokeStyle(o) {
      if (!o) return;
      if (o.startCap != null) CTX && (CTX.lineCap = ['butt', 'square', 'round'][o.startCap] || 'butt');
      if (o.lineJoin != null) CTX && (CTX.lineJoin = ['miter', 'bevel', 'round'][o.lineJoin] || 'miter');
      return o;
    },
    TextLayout() { return { Draw: () => { } }; },
  };

  /** 从 Direct2D 的 5×4 色相矩阵反解角度（数值拟合，够准也够快） */
  function hueFromMatrix(m) {
    const target = [m[0], m[1], m[2], m[4], m[5], m[6]];
    let best = 0, bestErr = Infinity;
    for (let deg = -180; deg <= 180; deg += 0.5) {
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const cand = [.213 + .787 * c - .213 * s, .213 - .213 * c + .143 * s, .213 - .213 * c - .787 * s,
                    .715 - .715 * c - .715 * s, .715 + .285 * c + .140 * s, .715 - .715 * c + .715 * s];
      let err = 0;
      for (let i = 0; i < 6; i++) err += (cand[i] - target[i]) ** 2;
      if (err < bestErr) { bestErr = err; best = deg; }
    }
    return best;
  }

  /* ------------------------------------------------------------------ 图像句柄 --
   * 主题对图像对象还会调用原版 SMP/D2D 的这几个方法（我一开始漏了，导致真 bug）：
   *   Resize(w, h)  任意尺寸副本（7 处）—— light 模式下环形的柔和阴影就靠它
   *   StackBlur(r)  就地模糊（4 处）
   *   Clone()       副本（2 处）
   * 缺 Resize 时的症状：ring.js:29 `s.Resize(...)` 抛 TypeError → 整帧 on_paint 被打断
   *   → SIGNAL 视图中心（频谱 + 环管线）整块空白，切回 dark 或重进视图才恢复（用户实测）。
   */
  function sourceCanvas(handle) {
    const el = handle && handle.__el;
    if (!el) return null;
    if (el.tagName === 'CANVAS') return el;
    if (handle.__cv) return handle.__cv;
    const w = el.naturalWidth || el.width || handle.Width || 1;
    const h = el.naturalHeight || el.height || handle.Height || 1;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, w); cv.height = Math.max(1, h);
    cv.getContext('2d').drawImage(el, 0, 0, cv.width, cv.height);
    handle.__cv = cv;
    return cv;
  }
  /**
   * D2D 5×4 颜色矩阵逐像素应用（列 = 输入 R,G,B,A 与偏移，行 = 输出 —— 与主题的两套矩阵都吻合）：
   *   outR = m0*R + m4*G + m8*B  + m12*A + m16
   *   outG = m1*R + m5*G + m9*B  + m13*A + m17
   *   outB = m2*R + m6*G + m10*B + m14*A + m18
   *   outA = m3*R + m7*G + m11*B + m15*A + m19
   * 例：tinted() 的 [k,0,0,0, 0,k,0,0, 0,0,k,0, 0,0,0,1, r*f,g*f,b*f,0] → outR = k*R + r*f（向背景淡出）✓
   * 结果按 源画布 + 矩阵 缓存（fx.js 的启动影片每帧都调 DrawEffect，不缓存会卡）。
   */
  const MATRIX_CACHE = new Map();
  function colourMatrix(src, m) {
    const key = m[0] + ',' + m[4] + ',' + m[8] + ',' + m[12] + ',' + m[16] + ',' + m[5] + ',' + m[10] + ',' + m[14] + ',' + m[17] + ',' + m[15];
    let byKey = null;
    for (const [s, v] of MATRIX_CACHE) if (s === src) { byKey = v; break; }
    if (byKey && byKey.has(key)) return byKey.get(key);
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    const id = g.getImageData(0, 0, cv.width, cv.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
      const nr = m[0] * r + m[4] * gg + m[8] * b + m[12] * a + m[16];
      const ng = m[1] * r + m[5] * gg + m[9] * b + m[13] * a + m[17];
      const nb = m[2] * r + m[6] * gg + m[10] * b + m[14] * a + m[18];
      const na = m[3] * r + m[7] * gg + m[11] * b + m[15] * a + m[19];
      d[i] = nr < 0 ? 0 : nr > 255 ? 255 : nr;
      d[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng;
      d[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb;
      d[i + 3] = na < 0 ? 0 : na > 255 ? 255 : na;
    }
    g.putImageData(id, 0, 0);
    if (!byKey) { byKey = new Map(); MATRIX_CACHE.set(src, byKey); }
    if (byKey.size > 24) byKey.delete(byKey.keys().next().value);
    byKey.set(key, cv);
    if (MATRIX_CACHE.size > 6) MATRIX_CACHE.delete(MATRIX_CACHE.keys().next().value);
    return cv;
  }
  /** 造一个和 CreateImage 同形状的句柄（能被 DrawImage 当源用、也能 GetGraphics 继续画） */  function makeImageHandle(cv, lw, lh, d) {
    const g2 = cv.getContext('2d');
    g2.setTransform(d, 0, 0, d, 0, 0);
    BASE_D.set(g2, d);
    const h = {
      __el: cv, __ready: true, __raw: cv, Width: lw, Height: lh, __dpr: d, __image: true,
      GetGraphics() { return makeGr(g2, cv); },
      ReleaseGraphics() { },
      Dispose() { },
    };
    return addImageOps(h);
  }
  function addImageOps(h) {
    h.Resize = function (w, hh) {
      const lw = Math.max(1, Math.round(w)), lh = Math.max(1, Math.round(hh));
      const d = h.__dpr || window.devicePixelRatio || 1;
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(lw * d)); out.height = Math.max(1, Math.round(lh * d));
      const g = out.getContext('2d');
      g.setTransform(d, 0, 0, d, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      const src = sourceCanvas(h);
      if (src) g.drawImage(src, 0, 0, src.width, src.height, 0, 0, lw, lh);
      return makeImageHandle(out, lw, lh, d);
    };
    // 就地模糊。用 canvas 的 filter 近似原版 StackBlur（radius 与高斯 σ 大致两倍关系，取一半）
    h.StackBlur = function (radius) {
      const src = sourceCanvas(h);
      if (!src || !src.width) return;
      const tmp = document.createElement('canvas');
      tmp.width = src.width; tmp.height = src.height;
      const tg = tmp.getContext('2d');
      tg.filter = `blur(${Math.max(0, (Number(radius) || 0) / 2).toFixed(2)}px)`;
      tg.drawImage(src, 0, 0);
      const g = src.getContext('2d');
      const d = h.__dpr || 1;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, src.width, src.height);
      g.filter = 'none';
      g.drawImage(tmp, 0, 0);
      g.restore();
      g.setTransform(d, 0, 0, d, 0, 0);
      if (h.__cv && h.__cv !== src) { /* 句柄缓存的是同一张，无需处理 */ }
    };
    h.Clone = function () {
      const src = sourceCanvas(h);
      const d = h.__dpr || window.devicePixelRatio || 1;
      const out = document.createElement('canvas');
      out.width = Math.max(1, (src && src.width) || Math.round((h.Width || 1) * d));
      out.height = Math.max(1, (src && src.height) || Math.round((h.Height || 1) * d));
      const g = out.getContext('2d');
      if (src) g.drawImage(src, 0, 0);
      return makeImageHandle(out, h.Width || out.width, h.Height || out.height, d);
    };
    return h;
  }

  function imageFor(rel) {
    if (!rel) return null;
    if (imageCache.has(rel)) return imageCache.get(rel);
    const dim = (MANIFEST.images || {})[rel];
    const handle = { __rel: rel, __ready: false, __el: null, __onReady: [], Width: dim ? dim.w : 0, Height: dim ? dim.h : 0, __image: true };
    const el = new Image();
    el.decoding = 'async';
    el.onload = () => {
      handle.__el = el; handle.__ready = true;
      handle.Width = el.naturalWidth; handle.Height = el.naturalHeight;
      dirty = true; schedule();           // 图片到位后自动重绘（主题自己有重绘节拍，这里兜底）
      const cbs = handle.__onReady.splice(0);
      for (const cb of cbs) { try { cb(handle); } catch (e) { console.error(e); } }
    };
    el.onerror = () => {
      handle.__ready = false;
      const cbs = handle.__onReady.splice(0);   // 失败的也要结算，否则 await 永远挂着
      for (const cb of cbs) { try { cb(handle); } catch (e) { } }
    };
    el.src = '/' + rel;
    handle.__el = el;
    imageCache.set(rel, handle);
    return addImageOps(handle);
  }

  /** 统一入口：拿到"已就绪（或已失败）"的图片句柄 */
  function imageReady(rel) {
    const h = imageFor(rel);
    if (!h || h.__ready || h.__failed) return Promise.resolve(h);
    return new Promise((res) => { h.__onReady.push(res); setTimeout(() => res(h), 15000); });
  }

  /* ================================================ fb / plman / utils -- */

  // foobar2000 主菜单命令表（fb.EnumerateMainMenuCommands 的返回内容）。
  // 主题用它做：Light/Dark 切换的兜底、可视化列表、DSP 预设列表。
  // 网页版没有 foobar2000 的菜单体系，这里给出最小可用集合。
  const MENU_COMMANDS = [
    { Type: 'Fixed', FullPath: 'View/Mode/Switch to other mode', Name: 'Switch to other mode' },
    { Type: 'Fixed', FullPath: 'View/Mode/Light', Name: 'Light' },
    { Type: 'Fixed', FullPath: 'View/Mode/Dark', Name: 'Dark' },
    { Type: 'Fixed', FullPath: 'View/Mode/Use system setting', Name: 'Use system setting' },
  ];

  /** fb.CreateMainMenuManager() —— 主题用它构建 File/Edit/View/… 子菜单 */
  function mainMenuManager() {
    return {
      __name: '',
      Init(name) { this.__name = String(name || ''); return true; },
      BuildMenu(menu, baseId, maxId) { return true; },   // 网页版没有原生菜单项可加
      ExecuteByID() { return false; },
      Dispose() { },
    };
  }

  /* ---------------------------------------------------------- 媒体库（宿主提供） -- */
  // 宿主（app.js）把扫好的曲库放在 window.__RHINE_LIBRARY__：
  //   { tracks: [{title,artist,album,albumArtist,genre,year,codec,bits,rate,kbps,lossless,
  //               length,disc,track,path,url,file}], playlists:[{name,items:[i…]}], activePlaylist, playing:{playlist,item} }
  const LIB_ROOT = () => window.__RHINE_LIBRARY__ || null;
  const libTracks = () => { const L = LIB_ROOT(); return (L && L.tracks) || []; };
  const libPlaylists = () => { const L = LIB_ROOT(); return (L && L.playlists) || []; };
  const trackAt = (i) => libTracks()[i] || null;

  /** 曲目句柄：主题只把它当"不透明 id + 少量属性"用。
   *  ⚠️ `RawPath` / `SubSong` 必须给：主题判断"同一首曲目"用的是
   *     `h.RawPath === k.RawPath && h.SubSong === k.SubSong`（archive.js 的 sameTrack），
   *     缺了这两个字段两边都是 undefined → **所有曲目互相相等** → 选中/提升/居中逻辑全乱
   *     （症状：点一张外壳，另一张被当成同一张，位置和动画都错）。 */
  function makeFileInfo(t) {
    // 主题只用到 MetaFind / MetaValueCount / MetaValue（lib/lyrics.js:64 读内嵌歌词标签），
    // 这里按 foobar2000 的字段名给出曲目已知的元数据；技术信息一并给出（Info* 系列）
    const meta = [];
    const add = (name, v) => { if (v != null && v !== '') meta.push([name.toUpperCase(), [String(v)]]); };
    add('TITLE', t.title); add('ARTIST', t.artist); add('ALBUM', t.album);
    add('ALBUM ARTIST', t.albumArtist || t.artist); add('GENRE', t.genre); add('DATE', t.year);
    add('TRACKNUMBER', t.track); add('DISCNUMBER', t.disc); add('PLAY_COUNT', t.plays);
    if (t.lyrics) add('LYRICS', t.lyrics);          // 标签解析器将来支持内嵌歌词时自动出现在这里
    const info = [['codec', t.codec || ''], ['bitrate', t.kbps ? t.kbps * 1000 : ''], ['samplerate', t.rate || ''], ['channels', t.channels || 2]];
    return {
      MetaCount: meta.length,
      MetaName: (i) => (meta[i] ? meta[i][0] : ''),
      MetaValueCount: (i) => (meta[i] ? meta[i][1].length : 0),
      MetaValue: (i, v) => (meta[i] ? (meta[i][1][v] == null ? '' : meta[i][1][v]) : ''),
      MetaFind: (name) => { const n = String(name).toUpperCase(); return meta.findIndex((e) => e[0] === n); },
      InfoCount: info.length,
      InfoName: (i) => (info[i] ? info[i][0] : ''),
      InfoValueCount: (i) => (info[i] ? 1 : 0),
      InfoValue: (i) => (info[i] ? String(info[i][1]) : ''),
      InfoFind: (name) => { const n = String(name).toLowerCase(); return info.findIndex((e) => e[0] === n); },
    };
  }
  function makeTrackHandle(i) {
    const t = trackAt(i);
    if (!t) return null;
    return {
      __id: i, __track: true, Length: t.length || 0, Path: t.path || '', RawPath: t.path || '', SubSong: 0, FileSize: t.size || 0,
      // ⚠️ 必须存在：主题的 loadLyrics() 会调它，缺了会抛 TypeError 并在 npChanged 里中断，
      //    导致同一函数后面的 waveLoad() 永远走不到（症状：signal 视图的波形一直是空的）
      GetFileInfo: () => (t.__fileInfo || (t.__fileInfo = makeFileInfo(t))),
    };
  }

  /* ---------------------------------------------------- 自动播放列表的查询 --
   * 主题的搜索会生成这种查询（header.js:295-299）：
   *   "world" → ( %title% HAS world OR %artist% HAS world OR %album artist% HAS world
   *               OR %album% HAS world OR %genre% HAS world OR %date% HAS world )
   * 多个词之间用 AND 连接。这里实现这个子集：每个 AND 项是一组括号里的 OR，
   * 每项形如 `%字段% HAS 词`（HAS 即"包含"，不区分大小写）。
   */
  function queryMatch(t, query) {
    const q = String(query == null ? '' : query).trim();
    if (!q) return true;
    const fields = fieldsOf(t);
    const terms = q.split(/\s+AND\s+/i).map((s) => s.trim()).filter(Boolean);
    return terms.every((term) => {
      let t2 = term.trim();
      while (t2.startsWith('(') && t2.endsWith(')')) t2 = t2.slice(1, -1).trim();   // 去一层括号
      return t2.split(/\s+OR\s+/i).some((part) => {
        const m = /^(%[^%]+%|[A-Za-z_ ]+?)\s+(HAS|IS|CONTAINS)\s+(.+)$/i.exec(part.trim());
        if (!m) return false;
        const key = m[1].replace(/%/g, '').trim().toLowerCase();
        const val = fields[key];
        if (val == null) return false;
        const needle = m[3].trim().replace(/^["']|["']$/g, '');
        return String(val).toLowerCase().includes(needle.toLowerCase());
      });
    });
  }

  /** 按排序格式（`%album artist% | %date% | %album% | %discnumber% | %tracknumber%`）给出匹配的曲目索引 */
  function autoQueryItems(query, sort) {
    const tracks = libTracks();
    const hits = [];
    for (let i = 0; i < tracks.length; i++) if (queryMatch(tracks[i], query)) hits.push(i);
    const parts = String(sort == null ? '' : sort).split('|')
      .map((s) => s.trim().replace(/%/g, '').trim().toLowerCase()).filter(Boolean);
    if (parts.length && hits.length) {
      const keyOf = (i) => { const f = fieldsOf(tracks[i]); return parts.map((p) => String(f[p] == null ? '' : f[p])); };
      hits.sort((a, b) => {
        const ka = keyOf(a), kb = keyOf(b);
        for (let k = 0; k < ka.length; k++) {
          if (ka[k] === kb[k]) continue;
          const na = parseFloat(ka[k]), nb = parseFloat(kb[k]);
          if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;   // 音轨/碟号按数值
          return ka[k].localeCompare(kb[k]);
        }
        return a - b;
      });
    }
    return hits;
  }

  /** 把曲目摊平成 foobar2000 的字段名（TitleFormat 用） */
  function fieldsOf(t) {    if (!t) return {};
    const m = Math.floor((t.length || 0) / 60), s = Math.round((t.length || 0) % 60);
    return {
      title: t.title || '', artist: t.artist || '', 'album artist': t.albumArtist || t.artist || '',
      album: t.album || '', genre: t.genre || '', date: t.year || '', year: t.year || '',
      // ⚠️ foobar2000 的 TitleFormat `%bitrate%` 单位是 **kbps**（320 kbps 的 MP3 → "320"），
      //    而 file-info 的 `bitrate` 字段单位是 bps。之前这里乘了 1000，卡片上就显示成
      //    "BITRATE 320,000"（实测）。makeFileInfo() 里的 Info* 才该用 bps。
      codec: t.codec || '', bitspersample: t.bits || '', samplerate: t.rate || '', bitrate: t.kbps || '',
      lossless: t.lossless ? '1' : '', length: `${m}:${String(s).padStart(2, '0')}`,
      length_seconds: String(Math.round(t.length || 0)), length_seconds_fp: String(t.length || 0),
      discnumber: t.disc || '1', tracknumber: t.track || '', added: t.added || '',
      play_count: t.plays || '0', path: t.path || '', subsong: '0', filename: String(t.path || '').split('\\').pop(),
    };
  }

  const SHARED = () => (window.__RHINE_SHARED__ || { transport: {}, library: [], playlists: [] });

  // 波形解码用的 AudioContext（懒建，只此一个）
  let WAVE_AC = null;
  /** 正在播放的**曲库曲目下标**：playing.item 是播放列表项下标，要经播放列表映射 */
  function playingTrackIndex() {
    const L = LIB_ROOT();
    if (!L || !L.playing || L.playing.item < 0) return -1;
    const pl = libPlaylists()[L.playing.playlist];
    if (!pl || !pl.items) return -1;
    const ti = pl.items[L.playing.item];
    return ti == null ? -1 : ti;
  }
  /** 曲目的可播放/可解码来源：HTTP 演示通道的 url，或选目录拿到的 File（生成 blob URL，缓存在曲目上） */
  function trackSource(t) {
    if (!t) return null;
    if (t.url) return t.url;
    if (t.file) {
      if (!t.__objUrl) { try { t.__objUrl = URL.createObjectURL(t.file); } catch (e) { return null; } }
      return t.__objUrl;
    }
    return null;
  }

  /** 句柄列表（fb.CreateHandleList / fb.GetLibraryItems / plman.GetPlaylistItems 的返回值）
   *  ⚠️ JSplitter 的句柄列表是**类数组**：主题里既有 `list.Item(i)` 也有 `list[i]` 下标访问
   *     （如 archive.js: `const h = list[i]`）。只实现 Item() 会让下标拿到 undefined，
   *      症状是卡片里的曲目行显示成 `01 ?` / `00:00`。所以用 Proxy 支持数字下标。 */
  function handleList(items = []) {
    const list = {
      Count: items.length,
      Item: (i) => items[i] || null,
      Add: (h) => { items.push(h); list.Count = items.length; return true; },
      AddRange: (other) => { if (other && other.Count) for (let i = 0; i < other.Count; i++) items.push(other.Item(i)); list.Count = items.length; return true; },
      AddItem: (h) => list.Add(h),
      Sort: () => { items.sort(); return true; },
      OrderByFormat: () => true, OrderByFilenames: () => true, OrderByPath: () => true, OrderByRelativePath: () => true,
      Find: () => -1, RemoveAll: () => true, Remove: () => false, RemoveById: () => false,
      Clone: () => handleList(items.slice()),
      GetLibraryRelativePaths: () => handleList(),
      // head 面板的 "041 TRACKS · 3:02:11 · 1.9 GB" 需要真实的总时长/总体积
      CalcTotalDuration: () => items.reduce((s, h) => { const t = h && trackAt(h.__id); return s + (t && t.length ? t.length : 0); }, 0),
      CalcTotalSize: () => items.reduce((s, h) => { const t = h && trackAt(h.__id); return s + (t && t.size ? t.size : 0); }, 0),
      CalcTotalSizeOf: () => 0,
      GetLength: () => items.length, Dispose: () => { },
      __items: items,
    };
    return new Proxy(list, {
      get(t, k) {
        if (typeof k === 'string' && k !== '' && /^\d+$/.test(k)) return items[Number(k)] || null;
        if (k === 'length') return items.length;
        return t[k];
      },
      set(t, k, v) {
        if (typeof k === 'string' && k !== '' && /^\d+$/.test(k)) { items[Number(k)] = v; return true; }
        t[k] = v; return true;
      },
      has(t, k) { return (typeof k === 'string' && /^\d+$/.test(k)) || k in t; },
    });
  }

  const fb = {
    ProfilePath: '', FoobarPath: '', ComponentPath: '', CursorFollowPlayback: false,
    get IsPlaying() { return !!SHARED().transport.playing; },
    get IsPaused() { return !!SHARED().transport.paused; },
    get PlaybackTime() { return SHARED().transport.time || 0; },
    // ⚠️ 主题用**赋值**来跳转（transport.js:361 进度条释放 `fb.PlaybackTime = drag.value`，
    //    还有滚轮 ±5s、点歌词行、点 signal 轨迹、方向键，共 5 处）。
    //    只给 getter 会在严格模式下抛 TypeError，而抛出的那行正好在 `drag = null` 之前
    //    → 拖动状态永远结束不了：游标一直跟着鼠标跑、点击进度条也不跳转（用户实测症状）。
    set PlaybackTime(v) { HOST.command('seek:' + (Number(v) || 0)); },
    get PlaybackLength() { return SHARED().transport.length || 0; },
    get Volume() { return SHARED().transport.volume != null ? SHARED().transport.volume : -10; },
    // 主题的音量条是**赋值**（transport.js: fb.Volume = pos2vol(...)），只给 getter 会在严格模式下抛错
    set Volume(v) { HOST.command('volume:' + v); },
    // ⚠️ L.playing.item 是**播放列表项下标**（与 plman 对齐），不是曲库曲目下标 ——
    //    必须经播放列表映射一次，否则 GetNowPlaying() 会返回"另一首"甚至 null
    //    （症状：signal 视图拿不到 handle，波形那条线一直是空的）
    GetNowPlaying() { const i = playingTrackIndex(); return i >= 0 ? makeTrackHandle(i) : null; },
    GetFocusItem() { const L = LIB_ROOT(); const t = L ? (L.focusTrack != null ? L.focusTrack : -1) : -1; return t >= 0 ? makeTrackHandle(t) : null; },
    GetLibraryItems() { const list = handleList(libTracks().map((_, i) => makeTrackHandle(i)).filter(Boolean)); return list; },
    CreateHandleList() { return handleList(); },
    TitleFormat(spec) {
      return {
        Eval: () => fmt(spec, {}),
        EvalWithMetadb: (h) => fmt(spec, fieldsOf(h && (h.__track ? trackAt(h.__id) : h))),
        EvalWithMetadbs: (list) => {
          const out = [];
          if (list) for (let i = 0; i < (list.Count || 0); i++) out.push(fmt(spec, fieldsOf(trackAt((list.Item(i) || {}).__id))));
          return out;
        },
        Dispose() { },
      };
    },
    // 曲库就绪前返回 false：主题会退回"用播放列表"，库就绪后宿主会触发 on_library_items_added 让它重新索引
    IsLibraryEnabled() { return !!LIB_ROOT(); },
    IsLibraryInitialised() { return !!LIB_ROOT(); },
    PlayOrPause() { HOST.command('toggle'); }, Play() { HOST.command('play'); }, Pause() { HOST.command('pause'); },
    Stop() { HOST.command('stop'); }, Next() { HOST.command('next'); }, Prev() { HOST.command('prev'); },
    VolumeUp() { HOST.command('vol-up'); }, VolumeDown() { HOST.command('vol-down'); },
    // 实时可视化：主题每帧调 analyseAudio(dt) → fb.GetAudioChunkTo(_pcm, 2048/采样率, 0, _info)
    // 期望：_pcm 是**交错声道**的 Float32，返回写入的浮点数个数，并把 SampleRate/ChannelCount 写进 info。
    // 网页版由父页面用 Web Audio（<audio> → ChannelSplitter → 两个 AnalyserNode）取最近 2048 个样本，
    // 同步填回这个数组 —— 主题随后自己做 2048 点 FFT、48 个对数频段、峰值/RMS/立体声相关性。
    GetAudioChunkTo(chunk, seconds, flags, info) {
      try { return (parent.__RHINE_AUDIO_PCM__ && parent.__RHINE_AUDIO_PCM__(chunk, seconds, info)) || 0; } catch (e) { return 0; }
    },
    GetAudioChunk(chunk, seconds, flags, info) { return fb.GetAudioChunkTo(chunk, seconds, flags, info); },
    RunMainMenuCommand(path) {
      const p = String(path || '');
      // 主题的 Light/Dark 切换走的就是这条：View › Mode
      const m = /^View\/Mode\/(.+)$/i.exec(p);
      if (m) { HOST.command('mode:' + m[1]); return true; }
      if (/^Library\/Configure$/i.test(p)) { HOST.command('add-music'); return true; }
      const pb = /^Playback\/(Play|Pause|Stop|Next|Previous)$/i.exec(p);
      if (pb) { HOST.command(pb[1].toLowerCase()); return true; }
      return false;
    },
    // 原版是 fb.ShowPreferences()：打开 foobar2000 的原生设置对话框。
    // 浏览器里没有 foobar2000，所以交给宿主弹一个"网页版首选项"（曲库来源 / 缓存 / 重置 /
    // 快捷键 / 关于）——主题自己的设置在 MENU 里，这里只放端口特有的东西。
    ShowPreferences() { HOST.command('preferences'); }, ShowPopupMessage() { }, ShowConsole() { },
    RegisterMainMenuCommand() { }, CreateMainMenuManager() { return mainMenuManager(); },
    // ⚠️ 主题拿它做 JSON.parse()，**必须返回 JSON 字符串**（返回数字会让 for…of 直接抛"不可迭代"，
    //    进而把 Light/Dark 切换整条链路打断）
    EnumerateMainMenuCommands() { return JSON.stringify(MENU_COMMANDS); },
    GetDSPPresets() { return []; }, GetActiveDSPs() { return []; }, SetDSPPreset() { },
    GetSelections() { return handleList(); },
  };

  /** fb.TitleFormat 的极简实现：够 03/04/05 视图显示用；真正的媒体库接上后再补全 */
  function fmt(spec, meta) {
    return String(spec || '').replace(/\[([^\]]*)\]/g, (_, inner) => {
      const v = fmt(inner, meta);
      return v === '?' ? '' : v;
    }).replace(/%([a-z_]+)%/gi, (_, name) => {
      const v = meta[name.toLowerCase()];
      return v == null ? '?' : String(v);
    }).replace(/\$if\(([^,]*),([^,]*)(?:,([^)]*))?\)/gi, (_, cond, a, b) => (cond.trim() && cond.trim() !== '?' ? a : (b || '')))
      .replace(/\$num\(([^,]*),(\d+)\)/gi, (_, n, w) => String(n).padStart(+w, '0'))
      .replace(/\$upper\(([^)]*)\)/gi, (_, s) => String(s).toUpperCase())
      .replace(/\$lower\(([^)]*)\)/gi, (_, s) => String(s).toLowerCase())
      .replace(/\$char\((\d+)\)/gi, (_, n) => String.fromCharCode(+n));
  }

  const plman = new Proxy({
    get ActivePlaylist() { return LIB_ROOT() ? (LIB_ROOT().activePlaylist ?? (libPlaylists().length ? 0 : -1)) : -1; },
    // 主题多处**赋值**切换当前播放列表（manager/header/archive/transport），必须有 setter
    set ActivePlaylist(v) { HOST.command('active-playlist:' + v); },
    get PlaylistCount() { return libPlaylists().length; },
    get PlayingPlaylist() { const L = LIB_ROOT(); return L && L.playing ? L.playing.playlist : -1; },
    get PlaybackOrder() { return 0; },
    get PlaylistRecycler() { return 0; },
    GetPlaylistName: (i) => (libPlaylists()[i] || {}).name || '',
    GetPlaylistItems: (i) => handleList(((libPlaylists()[i] || {}).items || []).map(makeTrackHandle).filter(Boolean)),
    GetPlaylistItemCount: (i) => ((libPlaylists()[i] || {}).items || []).length,
    PlaylistItemCount: (i) => ((libPlaylists()[i] || {}).items || []).length,
    FindPlaylist: (name) => libPlaylists().findIndex((p) => p.name === name),
    // CreatePlaylist / FindOrCreatePlaylist / SortByFormat* / RenamePlaylist 定义在下面（播放列表编辑区）    // 主题 playAlbum() 的链路：archivePlaylist()（找不到就建）→ loadAlbum()（清空+装专辑）→ 播放。
    // 之前三个都是 stub：CreatePlaylist 返回 -1 → playAlbum 在 `if (pl < 0) return` 处静默退出，
    // 卡片的 PLAY ALBUM / PLAY TRACK 按钮点了没反应。
    CreatePlaylist: (at, name) => {
      const idx = HOST.command(`create-playlist:${at == null ? -1 : at}:${String(name == null ? '' : name)}`);
      return typeof idx === 'number' ? idx : -1;
    },
    // ---- 自动播放列表（自动播放列表 = 由一条 foobar2000 查询语句从曲库算出来的列表）----
    // 主题的搜索就是它：header.js:319 `plman.CreateAutoPlaylist(idx, "Search", q, sort, 0)`，
    // 其中 q = "( %title% HAS world OR %artist% HAS world OR … )"。之前这里是 stub → 返回 -1 →
    // "Search" 列表建不出来 → 搜索后界面显示"No playlist"、什么都搜不到（用户实测）。
    // 这里实现的是**查询语言的一个最小子集**：`(字段 HAS 词 OR …) [AND (…)]`，
    // 足够覆盖主题生成的全部查询；排序格式按 `|` 分段逐字段比较。
    CreateAutoPlaylist: (idx, name, query, sort) => {
      const at = idx == null || idx < 0 ? -1 : idx;
      const items = autoQueryItems(query, sort);
      const pos = HOST.command(`auto-playlist:${at}:${encodeURIComponent(String(name == null ? '' : name))}:${items.join(',')}`);
      return typeof pos === 'number' ? pos : -1;
    },
    RemovePlaylist: (i) => { HOST.command(`delete-playlist:${Number(i) || 0}`); },
    IsAutoPlaylist: (i) => !!(libPlaylists()[i] || {}).auto,
    GetPlayingItemLocation: () => {
      const L = LIB_ROOT();
      const item = L && L.playing ? L.playing.item : -1;
      return { IsValid: item >= 0, PlaylistIndex: item >= 0 ? (L.playing.playlist ?? 0) : -1, PlaylistItemIndex: item };
    },
    GetPlaylistFocusItemIndex: (i) => { const L = LIB_ROOT(); return L && L.focusPlaylist === i ? (L.focus ?? -1) : -1; },
    // 选择集：宿主（app.js）维护 LIB.selection = { playlist, items[] }，
    // 网页版的原生列表（native/playlist.js）与 Columns UI 的 Playlist View 一样按整行选中
    GetPlaylistSelectedIndexes: (p) => {
      const L = LIB_ROOT();
      if (!L) return [];
      const sel = L.selection;
      if (sel && sel.playlist === p) return sel.items.slice();
      return L.focusPlaylist === p && L.focus >= 0 && (p === undefined || p === L.focusPlaylist) ? [L.focus] : [];
    },
    IsPlaylistItemSelected: (p, i) => {
      const L = LIB_ROOT();
      if (!L) return false;
      const sel = L.selection;
      if (sel && sel.playlist === p) return sel.items.includes(i);
      return L.focusPlaylist === p && L.focus === i;
    },
    GetPlaybackQueueContents: () => [],
    ExecutePlaylistDefaultAction: (p, i) => { HOST.command(`play:${p}:${i}`); return true; },
    SetPlaylistFocusItem: (p, i) => { HOST.command(`focus:${p}:${i}`); },
    // ⚠️ Columns UI 的语义：第三个参数是"选中/取消"这一项，**追加**到已有选择集
    //    （不是替换）。主题的 manager/transport 都是 ClearPlaylistSelection + 逐项 SetSingle(true)
    //    来构造选择集的，实现成替换会让多选只剩最后一项。
    SetPlaylistSelectionSingle: (p, i, on) => { HOST.command(`pl-seladd:${p}:${i}:${on === false ? 0 : 1}`); HOST.command(`focus:${p}:${i}`); },
    // 主题的 manager 面板用它清空/滚动原生列表（Columns UI Playlist View 的行为）
    ClearPlaylistSelection: (p) => { HOST.command(`pl-select:${p}:`); },
    EnsurePlaylistItemVisible: (p, i) => { HOST.command(`pl-ensure:${p}:${i}`); },
    // 移除当前选择集（网页版原生列表的右键菜单用；行为同 Columns UI：移除被选中的项）
    RemovePlaylistSelection: (p) => { HOST.command(`pl-remove:${p}`); },
    // `InsertPlaylistItemsFilter(pl, at, list)`：主题的整库随机（bus.js:76）不带过滤条件调用它，
    // 语义等同于把整份列表插进去，所以直接按普通插入实现
    InsertPlaylistItemsFilter: (p, at, list) => {
      const ids = [];
      for (let i = 0; i < ((list && list.Count) || 0); i++) { const h = list.Item(i); if (h && h.__id != null) ids.push(h.__id); }
      HOST.command(`insert-playlist:${p}:${at || 0}:${ids.join(',')}`);
    },
    ClearPlaylist: (p) => { HOST.command('clear-playlist:' + p); },
    // ⚠️ RemovePlaylist 的实现写在上面（自动播放列表那一段），这里不能再放一个空实现 ——
    //    对象字面量里同名键后者覆盖前者，之前就是被这行空实现盖掉导致搜索的旧列表删不掉。
    RemovePlaylistSwitch: () => { }, MovePlaylist: () => { },
    DuplicatePlaylist: () => -1, UndoBackup: () => { },
    // list 是 handleList（Proxy）：句柄由 makeTrackHandle(i) 生成，__id 即曲目索引
    InsertPlaylistItems: (p, at, list) => {
      try {
        const raw = list && list.__items;
        const items = raw || [];
        const n = list && list.Count != null ? list.Count : items.length;
        const ids = [];
        for (let i = 0; i < n; i++) {
          const h = items[i] != null ? items[i] : (list.Item ? list.Item(i) : null);
          ids.push(h && h.__id != null ? h.__id : -1);
        }
        HOST.command(`insert-playlist:${p}:${at == null ? 0 : at}:${ids.join(',')}`);
        return true;
      } catch (e) { return false; }
    },
    InsertPlaylistItemsFilter: () => { },
    // head 面板点列标题排序：用主题自己的排序格式（%title% / %artist% / %length_seconds%）逐项求值后重排
    SortByFormatV2: (p, fmtStr, dir) => {
      const items = ((libPlaylists()[p] || {}).items || []).slice();
      if (!items.length) return false;
      let tf = null;
      try { tf = fb.TitleFormat(fmtStr || ""); } catch (e) { tf = null; }
      const keyed = items.map((trackIdx, i) => {
        let k = "";
        try { k = String((tf && tf.EvalWithMetadb(makeTrackHandle(trackIdx))) || ""); } catch (e) { k = ""; }
        return { trackIdx, k, i };
      });
      const sgn = dir < 0 ? -1 : 1;
      keyed.sort((a, b) => sgn * (a.k.localeCompare(b.k, undefined, { numeric: true }) || (a.i - b.i)));
      HOST.command(`pl-reorder:${p}:${keyed.map((k) => k.trackIdx).join(",")}`);
      return true;
    },
    SortByFormat: (p, fmtStr, dir) => plman.SortByFormatV2(p, fmtStr, dir),
    // 播放列表改名（head 双击名字 → InputBox）
    RenamePlaylist: (p, name) => { HOST.command(`pl-rename:${p}:${String(name == null ? "" : name)}`); },
    // 主题的"整库随机"用它拿播放列表（没有就建）
    FindOrCreatePlaylist: (name, create) => {
      const found = libPlaylists().findIndex((p) => p.name === name);
      if (found >= 0) return found;
      return create ? plman.CreatePlaylist(-1, name) : -1;
    },
    ShowAutoPlaylistUI: () => false,
    IsPlaylistLocked: () => false,
    GetPlaylistItemsForPlayback: () => handleList(),
    AddLocations: () => { }, AddPlaylistItemToPlaybackQueue: () => { }, AddItemToPlaybackQueue: () => { },
  }, {
    get(t, k) { if (k in t) return t[k]; return () => undefined; },
  });

  // <profile>\audio-archive-cache\ 下的东西是**缓存**（波形 1024 个点 ≈ 5KB 一条），
  // 放进 localStorage 会很快撑爆配额，所以单独用内存表：语义一致（IsFile/Read/Write/Remove 都能命中），
  // 只是不跨会话保留 —— 主题读不到缓存时会自己重新解码（waveform.js:25 的分支）。
  const CACHE_FILES = new Map();
  const isCachePath = (k) => k.startsWith('audio-archive-cache/') || k.startsWith('audio-archive-cache\\');
  // MANIFEST.files 是完整文件清单（含音频等二进制），用 Set 兜住 O(1) 查询
  let FILE_SET = null;
  const fileSet = () => (FILE_SET || (FILE_SET = new Set(MANIFEST.files || [])));

  /**
   * 用户用 File System Access 选的本机目录（app.js 的 loadFsLibrary）。
   *
   * 为什么需要这一层：浏览器**拿不到真实绝对路径**，宿主只能把路径拼成 `D:\<目录名>\…`，
   * 而清单的键是"仓库相对路径"（musiclab/…）→ 永远命不中。
   * 症状就是用户实测的那个：选了 D:\AgentTestLab\RhinE-UI\musiclab，
   * Mili 那首的 .lrc 明明就在同一目录、文件名也同名，主题却问不到（utils.IsFile → false）。
   *
   * 宿主扫目录时把同名文本（.lrc/.srt/.txt/…）一起读进来，放到 parent.__RHINE_FS__：
   *   { text: Map<拼出来的路径, 文本>, files: Set<拼出来的路径> }
   * 同源 iframe 直接同步读父窗口属性（和 parent.__RHINE_CMD__ 同一路子），所以主题那些
   * **同步**调用（IsFile / ReadTextFile）能照常工作。
   */
  const fsOverlay = () => {
    try {
      const p = window.parent;
      return (p && p !== window && p.__RHINE_FS__) || null;
    } catch (e) { return null; }
  };
  /** 主题可能用反斜杠或正斜杠两种写法问同一个文件，两种键都试一遍 */
  const fsVariants = (p) => [String(p), String(p).replace(/\//g, '\\'), String(p).replace(/\\/g, '/')];
  const fsHas = (ov, p) => {
    if (!ov || !ov.files) return false;
    for (const k of fsVariants(p)) { try { if (ov.files.has(k)) return true; } catch (e) { } }
    return false;
  };
  const fsGet = (ov, p) => {
    if (!ov || !ov.text) return undefined;
    for (const k of fsVariants(p)) { try { if (ov.text.has(k)) return ov.text.get(k); } catch (e) { } }
    return undefined;
  };

  const utils = {
    // 主题会把设置写进 <profile>\audio-archive-settings.json（utils.WriteTextFile → localStorage 覆盖层），
    // 所以 IsFile / ReadTextFile 必须也认这一层，否则设置读不回来（保真度问题）
    __fileKey: (p) => 'rhine:file:' + norm(p),
    IsFile: (p) => {
      const k = norm(p);
      // 用户自己选的目录（File System Access）：路径是拼出来的，清单里不会有 —— 查宿主准备的覆盖层
      if (fsHas(fsOverlay(), p)) return true;
      if (Object.prototype.hasOwnProperty.call(MANIFEST.text, k)) return true;
      if (Object.prototype.hasOwnProperty.call(MANIFEST.images, k)) return true;
      // ⚠️ 音频这类二进制文件只在 MANIFEST.files（完整文件清单）里，不在 text/images 里。
      //    漏掉这一条，主题的 `T.missing = /^[a-z]:\\/i.test(path) && !utils.IsFile(path)`
      //    （lib/nowplaying.js:40）就会把真实存在的曲目判成"文件不存在" →
      //    03 LYRICS 中间画出一整块 SYSTEM WARNING · FILE NOT FOUND（实测踩到过）。
      if (fileSet().has(k)) return true;
      if (isCachePath(k)) return CACHE_FILES.has(k);
      try { return localStorage.getItem('rhine:file:' + k) != null; } catch (e) { return false; }
    },
    IsDirectory: (p) => { const d = norm(p).replace(/\/$/, '') + '/'; return (MANIFEST.files || []).some((f) => f.startsWith(d)); },
    ReadTextFile: (p) => {
      const k = norm(p);
      if (isCachePath(k)) return CACHE_FILES.has(k) ? CACHE_FILES.get(k) : '';
      // 用户自己选的目录里的同名文本（.lrc 歌词等）：宿主扫目录时已读进来，优先于仓库默认文件
      const over = fsGet(fsOverlay(), p);
      if (over !== undefined) return over;
      // ⚠️⚠️ 顺序很重要：**先看 localStorage 覆盖层，再看仓库里的默认文件**。
      //    之前反了（先返回 MANIFEST.text），而 audio-archive-settings.json 这份默认文件
      //    本身就在仓库里 → 于是用户保存过的设置**永远读不回来**，读到的始终是原始默认值。
      //    症状：界面语言在"点菜单的那个面板"生效（它靠 window.GetProperty 兜底），
      //    其它面板读默认文件 → 没这个键 → 回退系统语言 → 同一个界面里语言不一致
      //    （用户实测："只有部分换成了英文"）。同理，配色/视图/皮肤等设置也都读不回来。
      try { const v = localStorage.getItem('rhine:file:' + k); if (v != null) return v; } catch (e) { }
      if (Object.prototype.hasOwnProperty.call(MANIFEST.text, k)) return MANIFEST.text[k];
      return '';
    },
    WriteTextFile: (p, s) => {
      const k = norm(p);
      if (isCachePath(k)) { CACHE_FILES.set(k, s); return true; }
      // ⚠️ 主题的设置是"读整份 → 改一个键 → 覆盖整份写回"（lib/settings.js:26-32），而多个面板
      //    会同时这么干 → 后写的把别人刚加的键覆盖掉。实测丢过一次 uiLang：文件里没有它之后，
      //    getSetting 会回退到 window.GetProperty（**每个面板各自一份**），于是出现
      //    "header 面板英文、其它面板中文"这种同一界面语言不一致的怪象。
      //    这里对设置文件做一次按键合并（主题只会设键、从不删键，所以合并是安全的）。
      let out = s;
      if (/audio-archive-settings\.json$/.test(k)) {
        try {
          const old = JSON.parse(localStorage.getItem('rhine:file:' + k) || '{}');
          const neu = JSON.parse(s);
          if (old && neu && typeof old === 'object' && typeof neu === 'object' && !Array.isArray(neu)) {
            out = JSON.stringify(Object.assign({}, old, neu), null, 1);
          }
        } catch (e) { /* 不是 JSON 就原样写 */ }
      }
      try { localStorage.setItem('rhine:file:' + k, out); } catch (e) { }
      return true;
    },
    CreateFolder: () => true,
    RemoveFile: (p) => { const k = norm(p); if (isCachePath(k)) CACHE_FILES.delete(k); try { localStorage.removeItem('rhine:file:' + k); } catch (e) { } return true; },
    // 主题用 `for (const f of utils.Glob(root + "*\\case.json"))` 遍历，所以必须返回**可迭代的路径数组**，
    // 且路径保持主题的反斜杠形式（skins.js 会拿它做 slice 运算推导目录名）
    Glob(pattern) {
      const p = norm(pattern);
      const re = new RegExp('^' + p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
      return (MANIFEST.files || []).filter((f) => re.test(f)).map((f) => f.replace(/\//g, '\\'));
    },
    LoadFont: (p) => loadFont(norm(p)),
    // 全曲波形（SIGNAL 视图的 "signal trace"）：解码一次，按 points 个桶取每桶的绝对峰值。
    // 契约（同 JSplitter 的 utils.GetWaveformAsync，见主题 lib/waveform.js:33）：
    //   返回 Promise<Float32Array(points)>；onUpdate(values, start) 渐进回调，
    //   回调返回 false 表示取消（主题切换曲目时这么返回，解码随即停止）。
    GetWaveformAsync(handle, points, flags, unused, onUpdate) {
      const n = Math.max(1, Math.round(points || 1024));
      const full = new Float32Array(n);
      const t = handle && handle.__id != null ? trackAt(handle.__id) : null;
      const src = t ? trackSource(t) : null;
      if (!src) return Promise.reject(new Error('这一项没有可解码的来源'));
      // 整轨解码要把 PCM 全放进内存（44.1k 立体声约 21MB/分钟）：超长的先放弃，
      // 主题的 .catch 会记一行日志、信号迹线留空，不会影响别的
      if (handle && handle.Length > 2400) return Promise.reject(new Error('曲目过长，跳过整轨解码'));
      return new Promise((resolve, reject) => {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { reject(new Error('浏览器不支持 Web Audio')); return; }
        const ac = WAVE_AC || (WAVE_AC = new AC());
        fetch(src).then((r) => r.arrayBuffer()).then((buf) => ac.decodeAudioData(buf)).then((ab) => {
          const chans = [];
          for (let c = 0; c < ab.numberOfChannels; c++) chans.push(ab.getChannelData(c));
          const len = ab.length, per = len / n;
          let i = 0;
          const CHUNK = 128;
          const step = () => {
            const end = Math.min(n, i + CHUNK), vals = new Float32Array(end - i);
            for (let b = i; b < end; b++) {
              const a0 = Math.floor(b * per), a1 = Math.min(len, Math.max(a0 + 1, Math.floor((b + 1) * per)));
              // 每桶取 (峰值 × RMS)^0.65。为什么不是纯峰值：1024 个桶摊到整首歌，每桶约 0.2 秒，
              // 现代母带里每桶的峰值几乎都贴近满值 → 画出来是一条均匀"条码"
              //（实测均值 901/1000、81% 的桶 >0.9，渲染后变异系数只有 0.191）。
              // 主题会按最大值归一化，所以绝对大小无所谓，**只有形状**决定画面。
              // 拿原版自己缓存的同一首歌 1024 个值当真值拟合（真值 CV = 0.244）：
              //   纯峰值 CV 0.191 / 相关 0.844；纯 RMS CV 0.258 / 相关 0.891
              //   √(峰值×RMS) CV 0.215 / 相关 0.912
              //   (峰值×RMS)^0.65 CV 0.244 / 相关 0.909   ← 采用：起伏与原版一致
              let m = 0, sum = 0, cnt = 0;
              for (const d of chans) for (let k = a0; k < a1; k++) { const v = d[k] < 0 ? -d[k] : d[k]; if (v > m) m = v; sum += d[k] * d[k]; cnt++; }
              vals[b - i] = Math.pow(m * Math.sqrt(sum / Math.max(1, cnt)), 0.65);
            }
            full.set(vals, i);
            const keep = onUpdate ? onUpdate(vals, i) : true;
            i = end;
            if (keep === false || i >= n) { resolve(full); return; }
            setTimeout(step, 0);
          };
          step();
        }).catch(reject);
      });
    },
    GetSystemMetrics: (i) => (i === 0 ? screen.width : i === 1 ? screen.height : 16),
    IsKeyPressed: () => false,
    InputBox: (h, c, v) => { const r = window.prompt(c || h || '', v || ''); return r == null ? v || '' : r; },
    Run(exe, args, ...rest) {
      // 主题切换**配色方案**和**播放列表预设**的方式是：
      //   utils.Run(foobar2000.exe, `/columnsui:import-quiet "...\preset-<preset>-<scheme>-<mode>.fcl"`)
      // 即"重启 foobar2000 导入那份 .fcl"（Columns UI 的配色集只能靠导入布局来应用）。
      // 网页版没有"重启自己"，所以这里解析出预设/方案/模式，交给宿主直接应用配色集
      // —— 效果等价：主题随后在 on_colours_changed 里重读 GetColourCUI(3) 就能反查出新的 SCHEME/MODE。
      const a = String(args || '');
      const m = /preset-([A-Za-z0-9_-]+)-([A-Za-z0-9_-]+)-(light|dark)\.fcl/i.exec(a);
      if (m) {
        HOST.command(`import:${JSON.stringify({ preset: m[1], scheme: m[2], mode: m[3] })}`);
        return true;
      }
      console.log('[utils.Run 未实现]', exe, a);
      return false;
    },
    OpenDatabase: () => null,
    DownloadFileAsync: (url, path, onDone) => { setTimeout(() => onDone && onDone(0, 0), 0); },
    DownloadFile: () => false, DownloadImageAsyncV: (url, onDone) => setTimeout(() => onDone && onDone(null), 0),
    GetAlbumArtAsyncV: () => null, GetAlbumArtAsync: () => null,
    GetAlbumArtAsyncV2: () => Promise.resolve(null),
    // GetWaveformAsync 的实装在文件上半部分（写实时可视化那段附近）；这里只留未实现的 V 变体
    GetWaveformAsyncV: () => null,
    ReadINI: () => '', WriteINI: () => true,
    CheckComponent: () => false, GetPackageInfo: () => null,
    FormatDuration: (s) => String(s),
    ColourPicker: () => 0, FileTest: () => false,
  };

  function loadFont(rel) {
    const name = rel.split('/').pop().replace(/\.ttf$/i, '');
    const weightToken = (name.match(/GeistMono-(\w+)/) || [])[1] || 'Regular';
    const family = FONT_FAMILY_BY_FILE[weightToken] || 'Geist Mono';
    const weight = FONT_WEIGHT_BY_FILE[weightToken] || 400;
    try {
      const ff = new FontFace(family, `url(/${rel})`, { weight: String(weight), style: 'normal' });
      ff.load().then((f) => document.fonts.add(f)).catch(() => { });
    } catch (e) { }
    return true;
  }

  /* ============================================================== 宿主窗口 -- */

  const props = new Map();
  const HOST = {
    command() { },      // 由父页面覆盖：播放控制转发
    other() { },        // window.NotifyOthers 转发
  };

  const windowShim = {
    // ⚠️ 保持 96（= 1x 版式）。曾试过跟随 devicePixelRatio 放大，结果是"整套 UI 等比放大"，
    //    在同样的像素面积里反而互相挤压错位 —— 原版的版式不是把 1x 版式整体放大，
    //    而是按它自己的窗口尺寸重新排版。所以这里不要动。
    DPI: 96,
    ID: 'panel', DlgCode: 0, InstanceType: 0, Name: 'panel',
    Repaint() { dirty = true; schedule(); },
    RepaintRect() { dirty = true; schedule(); },
    SetTimeout(fn, ms) { const id = setTimeout(() => { timers.delete(id); try { fn(); } catch (e) { console.error(e); } }, Math.max(0, ms || 0)); timers.set(id, 't'); return id; },
    ClearTimeout(id) { clearTimeout(id); timers.delete(id); },
    SetInterval(fn, ms) { const id = setInterval(() => { try { fn(); } catch (e) { console.error(e); } }, Math.max(1, ms || 1)); timers.set(id, 'i'); return id; },
    ClearInterval(id) { clearInterval(id); timers.delete(id); },
    SetProperty(name, value) { props.set(name, value); try { localStorage.setItem(`rhine:prop:${CFG.id}:${name}`, JSON.stringify(value)); } catch (e) { } },
    GetProperty(name, def) {
      if (props.has(name)) return props.get(name);
      try { const raw = localStorage.getItem(`rhine:prop:${CFG.id}:${name}`); if (raw != null) { const v = JSON.parse(raw); props.set(name, v); return v; } } catch (e) { }
      return def;
    },
    NotifyOthers(name, info) { HOST.other(name, info); },
    Reload() { location.reload(); },
    /**
     * 主题的 i18n.js 用 ActiveXObject("WScript.Shell") 读注册表拿 **Windows 显示语言**
     * （lib/i18n.js:14-17：PreferredUILanguages → 回退 LocaleName）。
     * 浏览器里没有这个 API，主题的 try/catch 会吞掉异常并回退成 "en" ——
     * 结果就是"界面永远是英文，语言菜单选了中文也没用"。
     * 这里给一个最小替身：把语言标签从 navigator 报回去（中文 Windows → "zh-CN"），
     * 主题的 systemLang() 就能得出正确结论，默认语言随系统。
     */
    ActiveXObject(progId) {
      if (!/WScript\.Shell/i.test(String(progId))) throw new Error('ActiveXObject 不支持: ' + progId);
      const tag = () => (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
      return {
        RegRead(key) {
          const k = String(key).toLowerCase();
          if (k.includes('preferreduilanguages')) return tag();   // 主题会 split(/[,\s]/)[0]
          if (k.includes('localename')) return tag();
          throw new Error('未实现的注册表项: ' + key);
        },
        RegWrite() { }, ExpandEnvironmentStrings: (s) => s, Run() { }, Popup() { },
      };
    },
    GetColourCUI(type) { return COLOURS[type] != null ? COLOURS[type] : 0xFF000000; },
    GetColourDUI(type) { return COLOURS[type] != null ? COLOURS[type] : 0xFF000000; },
    SetCursor(id) { if (CANVAS) CANVAS.style.cursor = CURSORS[id] || 'default'; },
    GetPanelCount() { return (parent.__PANELS__ || []).length; },
    GetPanelByIndex(i) { return (parent.__PANELS__ || [])[i] || null; },
    CreatePopupMenu() { return popupStub(); },
    CreateThemeManager() { return { SetPartAndStateID: () => { }, IsThemePartDefined: () => false }; },
    ShowConfigure() { },
  };
  const CURSORS = { 0: 'default', 1: 'default', 2: 'text', 3: 'pointer', 4: 'wait', 5: 'crosshair', 6: 'pointer', 7: 'default', 8: 'nwse-resize', 9: 'nesw-resize', 10: 'ew-resize', 11: 'ns-resize', 12: 'move', 13: 'not-allowed' };

  /* ============================================================== 弹出菜单 -- *
   * 主题的菜单是**同步**用法（header.js:396 等）：
   *     theme.AppendTo(root, 0, "Audio Archive");
   *     const id = root.TrackPopupMenu(x, y, 0);
   *     if (id >= 450 && …) { … }            ← 那一长串分支紧接着执行
   * DOM 菜单天生异步，所以分两步走：
   *   ① TrackPopupMenu 先把菜单**画出来**，返回 0 —— 主题那串分支全落空，界面不受影响；
   *   ② 用户点选后记下 id，然后**重放打开菜单时的那次输入事件**（同一个 handler、同样的参数）：
   *      这一次 TrackPopupMenu 立刻返回该 id，主题的同步分支就真的执行了。
   * 为什么不改成回调：`if (id === …)` 链就写在输入处理函数体内，只记下 id 没有接收方。
   * 重放是安全的：输入处理函数本身是幂等的（只是重新构造一次菜单并走分支）。
   */
  let CUR_INPUT = null;      // 正在派发的输入事件 { name, args, ret }
  let MENU_PENDING = null;   // 已点选、等待重放的菜单 id
  let MENU_INPUT = null;     // 打开当前菜单时的那次输入
  let MENU_DOM = null;       // 正在显示的菜单根节点
  let SUB_DOM = null, SUB_TIMER = null;   // 当前展开的子菜单 + 延迟关闭定时器（整棵菜单树共用）
  const DISPATCH = { ev: null, evRet: null };   // 由 bindEvents() 填上

  // 子菜单**延迟**关闭：指针从父行移到子菜单要跨过几像素缝隙，立刻关会"还没碰到就消失"
  //（用户实测）。延迟期间指针进入子菜单就取消关闭；定时器是全树共用的，因此跨层级也成立。
  function subCancel() { if (SUB_TIMER) { clearTimeout(SUB_TIMER); SUB_TIMER = null; } }
  function subCloseNow() { subCancel(); if (SUB_DOM) { SUB_DOM.remove(); SUB_DOM = null; } }
  function subCloseSoon() { subCancel(); SUB_TIMER = setTimeout(subCloseNow, 260); }

  const MENU_CSS = 'position:fixed;z-index:2147483000;min-width:190px;max-height:82vh;overflow:auto;padding:4px 0;' +
    'background:#1b1c18;color:#f2f1ec;border:1px solid rgba(242,241,236,.22);' +
    'box-shadow:0 12px 34px rgba(0,0,0,.6);font:12px/1.6 "Geist Mono","Microsoft YaHei UI",monospace;' +
    'white-space:nowrap;user-select:none;-webkit-user-select:none';

  // ⚠️⚠️ 菜单必须画在**顶层页面**上，不能画在面板自己的 document 里：
  //      每个面板只是一个 iframe，header 只有 73px 高 —— 菜单画在里面会被 iframe 裁掉，
  //      下半截既看不见也点不到（实测：菜单确实生成了，但 y>73 的行点不到，
  //      因为那些坐标落在相邻面板上）。面板与宿主同源，所以直接用 window.top。
  const menuWin = () => { try { const t = window.top; return t && t.document && t.document.body ? t : window; } catch (e) { return window; } };
  const menuDoc = () => menuWin().document;
  // 面板内坐标 → 顶层页面坐标（菜单坐标来自主题的输入回调，是面板内的）
  const toPageXY = (x, y) => {
    try { const fe = window.frameElement; if (fe) { const r = fe.getBoundingClientRect(); return [r.left + x, r.top + y]; } } catch (e) { }
    return [x, y];
  };

  function closeMenu() {
    subCloseNow();
    if (MENU_DOM) { MENU_DOM.remove(); MENU_DOM = null; }
    // ⚠️ 菜单画在顶层文档上，但**整个 UI 都是 iframe**：在面板里点击不会冒泡到顶层文档，
    //    所以只挂顶层的话"点别处关不掉"（用户实测）。这里给每个同源面板文档都挂一份。
    for (const [w, d] of menuDocs()) {
      d.removeEventListener('mousedown', onMenuOutside, true);
      d.removeEventListener('keydown', onMenuKey, true);
      try { w.removeEventListener('resize', closeMenu, true); } catch (e) { }
    }
  }
  function menuDocs() {
    const out = [];
    try {
      const W = menuWin(), d = W.document;
      out.push([W, d]);
      for (const f of d.querySelectorAll('iframe')) {
        try { const cd = f.contentDocument; if (cd) out.push([f.contentWindow, cd]); } catch (e) { /* 跨域就跳过 */ }
      }
    } catch (e) { }
    return out;
  }
  function onMenuOutside(e) { if (MENU_DOM && !MENU_DOM.contains(e.target)) closeMenu(); }
  function onMenuKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } }

  function menuPick(id) {
    const input = MENU_INPUT;
    closeMenu();
    if (!input || !DISPATCH.evRet) return;
    MENU_PENDING = id;
    try { input.ret ? DISPATCH.evRet(input.name, ...input.args) : DISPATCH.ev(input.name, ...input.args); }
    finally { MENU_PENDING = null; MENU_INPUT = null; }
  }

  // 一个菜单节点；子菜单挂在行上，鼠标移入时在右侧展开
  function menuNode(popup) {
    const box = document.createElement('div');
    box.style.cssText = MENU_CSS;
    box.__popup = popup;                 // 诊断用：从 DOM 就能查到这一层菜单的条目
    let levelSub = null;                 // 本层当前展开的子菜单（同层互斥；父层的子菜单不受影响）
    // 先过滤掉不显示的空子菜单，并清掉"开头/结尾/连续"的分隔线
    //（主题在原生菜单后面加了一条分隔线；那几项被隐藏后它会变成开头的孤线）
    const items = popup.__items.filter((it) => !(it.k === 'sub' && (!it.menu || !it.menu.__items || !it.menu.__items.length)));
    while (items.length && items[0].k === 'sep') items.shift();
    while (items.length && items[items.length - 1].k === 'sep') items.pop();
    const shown = items.filter((it, i) => !(it.k === 'sep' && items[i - 1] && items[i - 1].k === 'sep'));
    for (const it of shown) {
      if (it.k === 'sep') {
        const s = document.createElement('div');
        s.style.cssText = 'height:1px;margin:4px 10px;background:rgba(242,241,236,.18)';
        box.appendChild(s);
        continue;
      }
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:3px 12px 3px 4px;cursor:default';
      const part = String(it.text == null ? '' : it.text);
      const tab = part.indexOf('\t');
      const main = tab >= 0 ? part.slice(0, tab) : part;
      const hint = tab >= 0 ? part.slice(tab + 1) : '';
      const mark = document.createElement('span');
      mark.textContent = it.k === 'sub' ? '' : (it.checked ? '●' : '');
      mark.style.cssText = 'width:12px;flex:0 0 12px;color:#ff7a1a;font-size:10px;text-align:center';
      const name = document.createElement('span');
      name.textContent = main;
      name.style.cssText = 'flex:1 1 auto' + (it.disabled ? ';opacity:.4' : '');
      row.appendChild(mark); row.appendChild(name);
      if (hint) { const h = document.createElement('span'); h.textContent = hint; h.style.cssText = 'color:rgba(242,241,236,.5);font-size:11px'; row.appendChild(h); }
      if (it.k === 'sub') { const a = document.createElement('span'); a.textContent = '▸'; a.style.cssText = 'color:rgba(242,241,236,.6)'; row.appendChild(a); }
      let sub = null;
      const openSub = () => {
        if (levelSub) { levelSub.remove(); levelSub = null; }   // 同层只留一个
        sub = null;
        if (it.k !== 'sub') return;
        const W = menuWin();
        sub = menuNode(it.menu);
        sub.style.display = 'block';
        // 指针进入子菜单就取消"延迟关闭"（跨层也生效，定时器是全树共用的）
        sub.addEventListener('mouseenter', subCancel);
        sub.addEventListener('mouseleave', subCloseSoon);
        const r = row.getBoundingClientRect();
        sub.style.left = Math.round(r.right - 4) + 'px';
        sub.style.top = Math.round(r.top - 5) + 'px';
        (MENU_DOM || menuDoc().body).appendChild(sub);
        const sr = sub.getBoundingClientRect();
        if (sr.right > W.innerWidth - 4) sub.style.left = Math.round(Math.max(4, r.left - sr.width + 4)) + 'px';
        if (sr.bottom > W.innerHeight - 4) sub.style.top = Math.round(Math.max(4, r.top - sr.height + 22)) + 'px';   // 底部放不下就往上顶
        levelSub = sub; SUB_DOM = sub;
      };
      row.addEventListener('mouseenter', () => { subCancel(); row.style.background = 'rgba(242,241,236,.12)'; openSub(); });
      row.addEventListener('mouseleave', () => { row.style.background = ''; if (it.k === 'sub') subCloseSoon(); });
      // 子菜单行：点击也展开（悬停在某些输入路径下不会触发 mouseenter，点一下更稳）
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (it.k === 'sub') { subCancel(); openSub(); return; }
        if (it.disabled) return;
        menuPick(it.id);
      });
      box.appendChild(row);
    }
    return box;
  }

  function showMenu(popup, x, y) {
    closeMenu();
    const W = menuWin(), d = menuDoc();
    MENU_DOM = menuNode(popup);
    const [px, py] = toPageXY(x, y);
    MENU_DOM.style.left = Math.round(px) + 'px';
    MENU_DOM.style.top = Math.round(py) + 'px';
    d.body.appendChild(MENU_DOM);
    const r = MENU_DOM.getBoundingClientRect();
    if (r.right > W.innerWidth - 4) MENU_DOM.style.left = Math.round(Math.max(4, W.innerWidth - r.width - 6)) + 'px';
    if (r.bottom > W.innerHeight - 4) MENU_DOM.style.top = Math.round(Math.max(4, W.innerHeight - r.height - 6)) + 'px';
    setTimeout(() => {
      for (const [w, d] of menuDocs()) {
        d.addEventListener('mousedown', onMenuOutside, true);
        d.addEventListener('keydown', onMenuKey, true);
        try { w.addEventListener('resize', closeMenu, true); } catch (e) { }
      }
    }, 0);
  }

  function createPopup() {
    const p = {
      __items: [],
      AppendMenuItem(flags, id, text) { this.__items.push({ k: 'item', flags: flags | 0, id: id | 0, text, checked: !!(flags & 0x8), disabled: !!(flags & 0x3) }); return this; },
      AppendMenuSeparator() { this.__items.push({ k: 'sep' }); return this; },
      AppendTo(parent, flags, text) { parent.__items.push({ k: 'sub', flags: flags | 0, text, menu: this }); return this; },
      CheckMenuItem(flags, id, on) { const it = this.__items.find((i) => i.k === 'item' && i.id === id); if (it) it.checked = !!on; return this; },
      CheckMenuRadioItem(first, last, on) { for (const i of this.__items) if (i.k === 'item' && i.id >= first && i.id <= last) i.checked = i.id === on; return this; },
      EnableMenuItem(flags, id, on) { const it = this.__items.find((i) => i.k === 'item' && i.id === id); if (it) it.disabled = !on; return this; },
      SetCurFocus() { return this; },
      Dispose() { return this; },
      TrackPopupMenu(x, y) {
        if (MENU_PENDING !== null) { const id = MENU_PENDING; MENU_PENDING = null; return id; }   // ② 重放：把选择交回主题
        MENU_INPUT = CUR_INPUT ? { name: CUR_INPUT.name, args: CUR_INPUT.args.slice(), ret: CUR_INPUT.ret } : null;
        if (!MENU_INPUT) return 0;      // 不是在输入处理里打开的（例如启动时构建），不弹
        showMenu(this, x, y);           // ① 先画出来，返回 0
        return 0;
      },
    };
    p.TrackPopupMenuEx = (x, y) => p.TrackPopupMenu(x, y);
    return p;
  }
  function popupStub() { return createPopup(); }

  /* =============================================================== 颜色表 -- */

  let COLOURS = { 3: 0xFF1B1C18 };   // 3 = background（archive/dark 的底色），启动时按 tokens.json 校准

  function calibrateColours() {
    try {
      const tok = JSON.parse(MANIFEST.text['themes/audio-archive/tokens/tokens.json'] || '{}');
      const scheme = (window.__RHINE_SCHEME__) || 'archive';
      const mode = (window.__RHINE_MODE__) || 'dark';
      const set = tok.schemes && tok.schemes[scheme] && tok.schemes[scheme][mode];
      if (set) {
        const hex = (set.bg || '#1b1c18').replace('#', '');
        COLOURS[3] = (0xFF000000 | parseInt(hex, 16)) >>> 0;
        COLOURS[1] = (0xFF000000 | parseInt((set.fg || '#ffffff').replace('#', ''), 16)) >>> 0;   // text
      }
      window.__RHINE_TOKENS__ = tok;
    } catch (e) { console.warn('tokens 解析失败', e); }
  }

  /* ========================================================== 生命周期 -- */

  function schedule() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!dirty) return;
      dirty = false;
      paint();
    });
  }

  function paint() {
    if (!HANDLERS.on_paint) return;
    try {
      HANDLERS.on_paint(makeGr(CTX, CANVAS));
    } catch (e) {
      console.error('[paint]', e);
      report('error', { phase: 'paint', message: String(e && e.stack || e) });
    }
  }

  function resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    DPR = dpr;                       // 拾取器要按设备像素读颜色（逻辑坐标 × DPR）
    W = Math.max(1, Math.round(w)); H = Math.max(1, Math.round(h));
    CANVAS.width = Math.round(W * dpr); CANVAS.height = Math.round(H * dpr);
    CANVAS.style.width = W + 'px'; CANVAS.style.height = H + 'px';
    CTX.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { HANDLERS.on_size && HANDLERS.on_size(W, H); } catch (e) { console.error('[size]', e); }
    dirty = true; schedule();
  }

  function report(type, data) { try { parent.postMessage({ __rhine: 1, id: CFG.id, type, data }, '*'); } catch (e) { } }

  /* ================================================ 加载（含 include） -- */

  function definePanelGlobals() {
    const g = window;
    g.d2d = d2d; g.fb = fb; g.plman = plman; g.utils = utils;
    Object.assign(window, windowShim);   // 面板脚本里的 window.X 就是宿主 API（注意：不能再赋回 window.window，它是只读 getter）
    /**
     * ⚠️ 单独再赋值一次（而不是只放在 windowShim 里）：主题的 i18n.js:14 是
     *    `const sh = new ActiveXObject("WScript.Shell")`，需要它**可被 new**。
     *    放在 windowShim 对象里时实测报 "ActiveXObject is not a constructor"，
     *    于是主题 catch 掉、SYSTEM_LANG 退回 "en" → 界面永远是英文。
     *    这里用函数表达式明确建一个构造函数，把 Windows 显示语言从 navigator 报回去
     *    （中文系统 → "zh-CN" → i18n.js 的 systemLang() 得到 zh-CN → 默认中文）。
     */
    g.ActiveXObject = function ActiveXObject(progId) {
      if (!/WScript\.Shell/i.test(String(progId))) throw new Error('ActiveXObject 不支持: ' + progId);
      const lang = () => (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
      return {
        RegRead(key) {
          const k = String(key).toLowerCase();
          if (k.indexOf('preferreduilanguages') >= 0) return lang();   // 主题会 split(/[,\s]/)[0]
          if (k.indexOf('localename') >= 0) return lang();
          throw new Error('未实现的注册表项: ' + key);
        },
        RegWrite() { }, ExpandEnvironmentStrings(s) { return s; }, Run() { }, Popup() { },
      };
    };
    g.DT_SINGLE = DT.SINGLELINE | DT.NOPREFIX | DT.VCENTER;
    g.DT_CENTER_SINGLE = g.DT_SINGLE | DT.CENTER;
    g.DT_RIGHT_SINGLE = g.DT_SINGLE | DT.RIGHT;
    g.DT_ELLIPSIS = DT.ENDELLIPSIS;
    g.MK_LBUTTON = MK.LBUTTON; g.MK_RBUTTON = MK.RBUTTON; g.MK_SHIFT = MK.SHIFT;
    g.MK_CONTROL = MK.CONTROL; g.MK_MBUTTON = MK.MBUTTON;
    g.DT_WORDBREAK = DT.WORDBREAK; g.DT_CALCRECT = 0x00000400;
    g.MOUSETRACK = {};
    // include()：依赖已由服务器解析并按序预加载，这里退化成 no-op（缺了就报出来）
    g.include = function include(p) {
      const key = norm(p);
      if (window.__RHINE_LOADED__ && window.__RHINE_LOADED__.has(key)) return;
      if (MANIFEST && MANIFEST.text && Object.prototype.hasOwnProperty.call(MANIFEST.text, key)) {
        console.warn('[include] 该文件未被预加载（依赖图漏了）:', key);
      } else {
        console.error('[include 缺失]', key);
      }
    };
    // JSplitter 的 Worker 是专有签名：new Worker({ file: path }, name)。
    // 这里换成**通往真 worker 的桥**：把主题的 index/covers 请求转给 workers/library-web.js，
    // 再把 worker 的回包改造成主题期望的形状（ImageBitmap → 本 shim 的图片句柄）。
    // 只有 stage 面板（include 了 lib/library.js）会创建它，所以全局只有一个 worker。
    g.Worker = function RhineWorkerBridge(fileOrOpts, name) {
      const file = fileOrOpts && fileOrOpts.file ? fileOrOpts.file : fileOrOpts;
      const w = {
        onmessage: null, onerror: null, onmessageerror: null,
        postMessage: () => { }, terminate() { try { real && real.terminate(); } catch (e) { } },
        addEventListener() { }, removeEventListener() { }, dispatchEvent() { return false; },
      };
      let real = null, pendingIndex = null;
      try {
        real = new NativeWorker('/workers/library-web.js', { type: 'module' });
      } catch (e) {
        console.error('[库 worker 创建失败]', e);
        return w;
      }
      console.log(`[Worker 桥] ${name || ''} ← ${file}  →  /workers/library-web.js`);
      workingWorkers.push(w);

      // ⚠️⚠️ 模块 worker 的坑：在它的模块**求值完成之前** postMessage 会被丢掉
      //      （实测：new Worker(...) 后立刻发，worker 收不到任何东西；延迟 1.2s 发才正常）。
      //      而主题的写法就是建完立刻 postMessage，于是媒体库时好时坏地永远解析不出来
      //      （表现为曲库为空、播放列表 0 行、signal 波形没有数据）。
      //      这里把"就绪前"的消息排队，等 worker 第一次回话、或短延时后统一补发。
      const bootQueue = [];
      let booted = false;
      const bootFlush = () => {
        if (booted) return;
        booted = true;
        for (const m of bootQueue.splice(0)) { try { real.postMessage(m); } catch (e) { } }
        if (bootQueue.length === 0 && pendingIndex) { const m = pendingIndex; pendingIndex = null; send(m); }
      };
      setTimeout(bootFlush, 250);

      real.onmessage = (ev) => {
        bootFlush();
        const m = ev.data || {};
        try {
          if (m.type === 'catalog') {
            window.__RHINE_CATALOG__ = m;    // 宿主读取（播放需要路径/来源）
            try { parent.__RHINE_ON_CATALOG__ && parent.__RHINE_ON_CATALOG__(m); } catch (e) { }
            if (w.onmessage) w.onmessage({ data: { gen: m.gen, type: 'catalog', tracks: m.tracks, albums: m.albums, items: m.items, ms: m.ms, written: m.written } });
          } else if (m.type === 'cover') {
            if (w.onmessage) w.onmessage({ data: { gen: m.gen, type: 'cover', key: m.key, img: bitmapHandle(m.thumb), blur: bitmapHandle(m.blur) } });
          }
        } catch (e) { console.error('[库消息处理]', e); }
      };
      real.onerror = (e) => { console.error('[库 worker 出错]', e.message || e); if (w.onerror) w.onerror(e); };

      // 就绪前发给真实 worker 的消息先入队（见上面 bootFlush 的说明）
      const postReal = (m) => { if (booted) real.postMessage(m); else bootQueue.push(m); };
      const send = (msg) => {
        if (!msg) return;
        if (msg.type === 'index') {
          // ⚠️ 读**本面板**的 window（宿主把曲库挂在每个面板的 window 上），不是 parent
          const lib = window.__RHINE_LIBRARY__;
          if (!lib || !lib.files || !lib.files.length) { pendingIndex = msg; console.log('[库桥] 索引请求排队（曲库未就绪）gen=' + msg.gen); return; }
          console.log('[库桥] 转发索引请求 gen=' + msg.gen + '，文件 ' + lib.files.length + ' 个');
          postReal({ cmd: 'index', gen: msg.gen, files: lib.files });
        } else if (msg.type === 'covers') {
          const keys = (msg.list || []).map((j) => (typeof j === 'string' ? j : j && j.key)).filter(Boolean);
          console.log('[库桥] 请求封面 ' + keys.length + ' 张');
          if (keys.length) postReal({ cmd: 'covers', gen: msg.gen, keys });
        }
      };
      w.postMessage = send;
      w.__flush = () => { if (pendingIndex) { const m = pendingIndex; pendingIndex = null; send(m); return true; } return false; };
      return w;
    };
  }

  /* ================================================== 事件转发到主题 -- */

  function bindEvents() {
    const ev = (fn, ...args) => {
      const h = HANDLERS[fn]; if (!h) return;
      const prev = CUR_INPUT; CUR_INPUT = { name: fn, args, ret: false };   // 菜单点选后按它重放
      try { h(...args); } catch (e) { console.error('[' + fn + ']', e); } finally { CUR_INPUT = prev; }
    };
    DISPATCH.ev = ev;
    const mask = (e) => (e.buttons & 1 ? MK.LBUTTON : 0) | (e.buttons & 2 ? MK.RBUTTON : 0) | (e.buttons & 4 ? MK.MBUTTON : 0) | (e.shiftKey ? MK.SHIFT : 0) | (e.ctrlKey ? MK.CONTROL : 0);
    const pos = (e) => { const r = CANVAS.getBoundingClientRect(); return [Math.round(e.clientX - r.left), Math.round(e.clientY - r.top)]; };

    /* ---------------------------------------------------------- 布局元素拾取 --
     * 这个 UI 里没有可选的 DOM 元素：每个面板只有一个 <canvas>，按钮和外壳都是画上去的像素。
     * 所以 DevTools 的"选取元素"只能选到 iframe/canvas 这一层。这里提供一个拾取器：
     *   · 按住 Alt 点击画面任意位置，或
     *   · 宿主打开"拾取模式"后直接点击
     * 就把 [面板名 / 面板内坐标 / 主题的命中区 id / 该像素颜色] 报给宿主，
     * 宿主打印一行可复制的信息（同时写进剪贴板）。拾取时吞掉这次点击，不会触发界面动作。
     */
    let PICKING = false;
    // ⚠️ 这里必须用 window，不能用 g —— bindEvents() 的作用域里没有 g，
    //    写成 g.xxx 会抛 ReferenceError 把整个 bindEvents 打断（鼠标监听全不注册、启动也卡住）
    window.__rhineSetPicking = (on) => {
      PICKING = !!on;
      document.documentElement.style.cursor = PICKING ? 'crosshair' : '';
      if (PICKING) console.log('[拾取] 已开启：点画面上你要指的那部分');
    };
    const panelName = () => (CFG && (CFG.id || CFG.panel || CFG.name)) || document.title || 'unknown';
    CANVAS.addEventListener('click', (e) => {
      if (!PICKING && !e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();          // 捕获阶段拦下，主题的 on_mouse_lbtn_up 不会跑
      const [x, y] = pos(e);
      const px = (() => {
        try { const d = CTX.getImageData(Math.round(x * DPR), Math.round(y * DPR), 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); } catch (err) { return '?'; }
      })();
      let hit = '（对话由宿主解析）';
      const rep = {
        panel: panelName(), x, y, px,
        // 诊断：画布后备尺寸 / CSS 尺寸 / 缩放比 / 面板 CSS 尺寸 —— 排查"画的和算的不一致"
        canvas: `${CANVAS.width}x${CANVAS.height}`,
        css: `${CANVAS.style.width || 'auto'}x${CANVAS.style.height || 'auto'}`,
        dpr: DPR,
        frame: `${window.innerWidth}x${window.innerHeight}`,
        logW: `${typeof W !== 'undefined' ? W : '?'}x${typeof H !== 'undefined' ? H : '?'}`,
      };
      try { parent.__RHINE_PICK__ && parent.__RHINE_PICK__(rep); } catch (err) { }
      console.log(`[拾取] 面板=${rep.panel} 坐标=${x},${y} 颜色=${px}`);
    }, true);

    CANVAS.addEventListener('mousemove', (e) => { const [x, y] = pos(e); ev('on_mouse_move', x, y, mask(e)); });
    CANVAS.addEventListener('mouseleave', (e) => ev('on_mouse_leave'));
    CANVAS.addEventListener('mousedown', (e) => { const [x, y] = pos(e); if (e.button === 0) ev('on_mouse_lbtn_down', x, y, mask(e)); else if (e.button === 2) ev('on_mouse_rbtn_down', x, y, mask(e)); });
    CANVAS.addEventListener('mouseup', (e) => {
      const [x, y] = pos(e);
      if (e.button === 0) ev('on_mouse_lbtn_up', x, y, mask(e));
      else if (e.button === 2) { const r = evRet('on_mouse_rbtn_up', x, y, mask(e)); if (r === false) e.preventDefault(); }
    });
    CANVAS.addEventListener('dblclick', (e) => { const [x, y] = pos(e); ev('on_mouse_lbtn_dblclk', x, y, mask(e)); });
    CANVAS.addEventListener('wheel', (e) => { const [x, y] = pos(e); ev('on_mouse_wheel', -Math.sign(e.deltaY), x, y, mask(e)); }, { passive: true });
    CANVAS.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (evRet('on_key_down', e.keyCode, 0) === false) e.preventDefault();
      if (e.key && e.key.length === 1) ev('on_char', e.key.charCodeAt(0));
    });
    window.addEventListener('keyup', (e) => ev('on_key_up', e.keyCode, 0));
    window.addEventListener('focus', () => ev('on_focus', true));
    window.addEventListener('blur', () => ev('on_focus', false));
    window.addEventListener('resize', () => { if (CFG.fill) resize(document.documentElement.clientWidth, document.documentElement.clientHeight); });

    parent.addEventListener('message', (e) => {
      const m = e.data;
      if (!m || m.__rhineTo !== CFG.id) return;
      if (m.event === 'notify' && HANDLERS.on_notify_data) { try { HANDLERS.on_notify_data(m.name, m.info); } catch (err) { } }
      else if (m.event === 'call' && HANDLERS[m.name]) { try { HANDLERS[m.name](...(m.args || [])); } catch (err) { } }
      else if (m.event === 'size') resize(m.w, m.h);
      else if (m.event === 'colours') { calibrateColours(); if (HANDLERS.on_colours_changed) HANDLERS.on_colours_changed(); }
    });
  }
  function evRet(fn, ...args) {
    const h = HANDLERS[fn]; if (!h) return undefined;
    const prev = CUR_INPUT; CUR_INPUT = { name: fn, args, ret: true };      // 菜单点选后按它重放
    try { return h(...args); } catch (e) { console.error('[' + fn + ']', e); } finally { CUR_INPUT = prev; }
  }
  DISPATCH.evRet = evRet;

  /* ================================================================ boot -- */

  window.__boot = function boot(cfg) {
    BOOT_CFG = cfg;
    CFG = cfg; MANIFEST = cfg.manifest;
    // ⚠️ 同一 realm 内的**重复 boot**：宿主在 iframe 的 load 事件里调 start()，
    //    而线上实测 transport 面板会收到两次 load（脚本数 30 = 14×2 + shim）→
    //    主题脚本被注入两遍 → 第二次执行时 `const SETTINGS_FILE` 重复声明 →
    //    `Uncaught SyntaxError: Identifier 'SETTINGS_FILE' has already been declared`，
    //    一加载就刷 33 条错误（用户没看到，但这是真 bug）。
    //    处理：跳过"新建画布 + 注入脚本"这两件只能做一次的事，**但照常重跑握手**
    //    （否则面板不再报 ready，宿主那边会一直等 —— 我第一次直接 return 就把模式切换卡死了）。
    //    真正的 window.Reload() 是导航，realm 全新、这个标记不存在，刷新照常。
    if (window.__RHINE_BOOTED__) {
      console.warn('[shim] 重复 boot：跳过画布与脚本注入，只重跑握手');
      try { finishBoot(performance.now()); } catch (e) { console.error('[shim] 重复 boot 握手失败', e); }
      return;
    }
    window.__RHINE_BOOTED__ = true;
    // 一次性把"原版参考状态"种进设置文件（种子 = 根目录 audio-archive-settings.json，由服务器进清单）。
    // 老浏览器的 localStorage 里存着更早的设置（TRACKS 模式、别的选中项），而 ReadTextFile 是
    // localStorage 优先 —— 不迁移的话永远读不回参考状态。seed 版本号一致就不动，
    // 用户之后的改动都保留（主题 setSetting 写回时会把 seed 一起带出去）。
    try {
      const seedText = (MANIFEST.text || {})['audio-archive-settings.json'];
      if (seedText) {
        const seed = JSON.parse(seedText);
        const KEY = 'rhine:file:audio-archive-settings.json';
        const cur = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (!cur || cur.seed !== seed.seed) localStorage.setItem(KEY, JSON.stringify(seed));
      }
    } catch (e) { /* 种子解析失败就用现有设置 */ }
    // 与父页面（面板容器）接线：NotifyOthers → 总线；播放控制 → 宿主
    HOST.other = (name, info) => { try { parent.__RHINE_BUS__ && parent.__RHINE_BUS__.post(cfg.id, name, info); } catch (e) { } };
    // 返回宿主处理结果：plman.CreatePlaylist 需要 create-playlist 命令返回的新下标
    HOST.command = (cmd) => { try { return parent.__RHINE_CMD__ && parent.__RHINE_CMD__(cmd); } catch (e) { } };
    calibrateColours();

    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = 'transparent';
    CANVAS = document.createElement('canvas');
    CANVAS.style.display = 'block';
    CTX = CANVAS.getContext('2d', { alpha: true });
    document.body.appendChild(CANVAS);

    definePanelGlobals();
    if (cfg.region) window.REGION = cfg.region;
    if (cfg.globals) for (const [k, v] of Object.entries(cfg.globals)) window[k] = v;

    // 1) 按服务器解析好的依赖顺序插入经典脚本
    //    经典脚本共享全局词法作用域（A 的 const/function 对 B 可见），正是主题 include() 想要的语义；
    //    用 eval 做不到这点：主题每个文件都是 "use strict"，严格 eval 的声明不会进全局。
    const key = cfg.scriptKey || String(cfg.entry).split('/').pop().replace('.js', '');
    const order = (MANIFEST && MANIFEST.scripts && MANIFEST.scripts[key]) || [];
    if (!order.length) {
      report('error', { phase: 'load', message: '没有解析到脚本顺序: ' + key, keys: MANIFEST && MANIFEST.scripts ? Object.keys(MANIFEST.scripts) : [] });
      return;
    }
    window.__RHINE_LOADED__ = new Set(order);

    const loadOne = (rel) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/' + rel;
      s.async = false;
      s.onload = () => resolve(rel);
      s.onerror = () => reject(new Error('脚本加载失败: ' + rel));
      document.head.appendChild(s);
    });

    (async () => {
      const t0 = performance.now();
      for (const rel of order) {
        try { await loadOne(rel); }
        catch (e) { console.error('[script]', e); report('error', { phase: 'script', message: e.message }); return; }
      }
      finishBoot(t0);
    })();
  };

  /** 脚本全部就位后：收集回调 → 绑定事件 → 首次布局与绘制 */
  function finishBoot(t0) {
    const names = ['on_size', 'on_paint', 'on_colours_changed', 'on_mouse_move', 'on_mouse_leave', 'on_mouse_lbtn_down',
      'on_mouse_lbtn_up', 'on_mouse_lbtn_dblclk', 'on_mouse_rbtn_up', 'on_mouse_rbtn_down', 'on_mouse_mbtn_up',
      'on_mouse_wheel', 'on_key_down', 'on_key_up', 'on_char', 'on_focus', 'on_notify_data',
      'on_playback_starting', 'on_playback_new_track', 'on_playback_stop', 'on_playback_pause', 'on_playback_seek',
      'on_playback_time', 'on_playback_queue_changed', 'on_playback_order_changed', 'on_volume_change',
      'on_playlists_changed', 'on_playlist_switch', 'on_playlist_items_added', 'on_playlist_items_removed',
      'on_playlist_items_reordered', 'on_playlist_items_selection_change', 'on_item_focus_change',
      'on_metadb_changed', 'on_library_items_added', 'on_library_items_removed', 'on_library_items_changed',
      'on_main_menu_dynamic', 'on_dsp_preset_changed', 'on_download_file_done'];
    HANDLERS = {};
    for (const n of names) if (typeof window[n] === 'function') HANDLERS[n] = window[n];

    bindEvents();
    resize(CFG.w || document.documentElement.clientWidth, CFG.h || document.documentElement.clientHeight);
    paint();
    report('ready', { handlers: Object.keys(HANDLERS), ms: +(performance.now() - t0).toFixed(1), scripts: (window.__RHINE_LOADED__ || new Set()).size });
  }

  window.__rhine = {
    call(name, ...args) { const h = HANDLERS[name]; if (h) { try { return h(...args); } catch (e) { console.error(e); } } },
    repaint() { dirty = true; schedule(); },
    size(w, h) { resize(w, h); },
    setShared(obj) { window.__RHINE_SHARED__ = obj; },
    /** 宿主「首选项 › 清空缓存」用：波形等缓存都在本面板的内存表里 */
    clearCache() { const n = CACHE_FILES.size; CACHE_FILES.clear(); return n; },
    /**
     * 切换浅色 / 深色。主题里"模式"其实是 Columns UI 的**活动配色集**：
     * tokens.js 的 refreshTokens() 读 window.GetColourCUI(3)（配色集背景色），
     * 再拿它去 tokens.json 里反查 MODE/SCHEME。所以这里改配色集 + 触发 on_colours_changed 即可。
     */
    setMode(mode) {
      window.__RHINE_MODE__ = (mode === 'light' || mode === 'dark') ? mode : (window.__RHINE_MODE__ === 'light' ? 'dark' : 'light');
      calibrateColours();
      if (HANDLERS.on_colours_changed) { try { HANDLERS.on_colours_changed(); } catch (e) { console.error('[colours]', e); } }
      dirty = true; schedule();
      return window.__RHINE_MODE__;
    },
    getMode() { return window.__RHINE_MODE__ || 'dark'; },
    getScheme() { return window.__RHINE_SCHEME__ || 'archive'; },
    /** 曲库就绪：把之前排队的索引请求放出去（主题此时才会真正拿到 albums/tracks）
     *  返回 true 表示确实放行了排队的请求 —— 宿主据此决定是否还需要再触发一次
     *  on_library_items_added（避免同一份曲库被解析两遍） */
    libraryReady() {
      let flushed = false;
      for (const w of workingWorkers) { try { if (w.__flush && w.__flush()) flushed = true; } catch (e) { } }
      return flushed;
    },
    /**
     * 宿主**没有任何曲库**时也要把"媒体库已就绪"告诉主题。
     * 为什么必须做：主题的 LIB.live 只在 worker 送来 catalog 消息时才置真（lib/library.js:69），
     * 而空曲库时那条路径不会自己发生 —— 于是档案页永远停在 "INDEXING LIBRARY …"，
     * 连主题自带的「+ ADD MUSIC FOLDER」入口（archive.js:762，条件是 LIB.live && !LIB.filter）
     * 都不出现。部署到公网后，全新访客看到的就是一个永远转圈的页面。
     * 这里直接按主题自己的消息格式喂一条 0 曲目的 catalog（gen 必须与主题当前的 LIB.gen 一致，
     * 否则 libMessage 第一行就 return）。
     */
    emptyCatalog() {
      try {
        if (typeof LIB === 'undefined' || !LIB || LIB.live) return false;
        const m = {
          gen: LIB.gen, type: 'catalog', tracks: 0, albums: [], items: [],
          ms: { index: 0, cache: 0 }, written: 0,
        };
        if (typeof libMessage === 'function') { libMessage(m); return true; }
      } catch (e) { console.error('emptyCatalog', e); }
      return false;
    },
    /** 宿主推送播放状态后，让主题重绘并触发对应的播放事件 */
    transport(evt, arg) {
      if (evt) { const h = HANDLERS[evt]; if (h) { try { h(arg); } catch (e) { console.error('[' + evt + ']', e); } } }
      dirty = true; schedule();
    },
    /**
     * 应用"配色集"（等价于原版导入 .fcl 预设后重读 Columns UI 颜色）：
     * 方案 + 模式 → 背景色 → refreshTokens() 反查 → SCHEME/MODE/整套调色板
     */
    setLook({ scheme, mode } = {}) {
      if (scheme) window.__RHINE_SCHEME__ = scheme;
      if (mode === 'light' || mode === 'dark') window.__RHINE_MODE__ = mode;
      calibrateColours();
      if (HANDLERS.on_colours_changed) { try { HANDLERS.on_colours_changed(); } catch (e) { console.error('[colours]', e); } }
      dirty = true; schedule();
      return { scheme: window.__RHINE_SCHEME__ || 'archive', mode: window.__RHINE_MODE__ || 'dark' };
    },
    /** 主题运行状态（诊断用） */
    debug() {
      const ev = (e) => { try { return eval(e); } catch (err) { return 'ERR: ' + err.message; } };
      return { handlers: Object.keys(HANDLERS), view: ev('typeof STATE !== "undefined" ? STATE.view : null'), mode: window.__RHINE_MODE__ || 'dark' };
    },
  };
})();
