(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const out = {};
  // ① 主题自己的命中测试（hits 是 lib/draw.js 的 Hits 实例）
  out.hitAt454_493 = ev('(function(){ try { const a = hits.at(454,493); return a ? (a.id + " data=" + JSON.stringify(a.data)) : "无命中"; } catch(e){ return "ERR " + e.message; } })()');
  // ② 悬停：直接调 on_mouse_move，看 AR.hover 是否被设置
  out.hoverBefore = ev('(function(){ try { return JSON.stringify(AR.hover); } catch(e){ return "ERR"; } })()');
  ev('on_mouse_move(454, 493, 0)');
  out.hoverAfter = ev('(function(){ try { return JSON.stringify(AR.hover); } catch(e){ return "ERR"; } })()');
  // ③ 直接调点击回调（绕过 DOM 事件）
  out.inspBefore = ev('(function(){ try { return String(AR.inspOn) + "/" + (AR.selAlbum ? AR.selAlbum.title : "null"); } catch(e){ return "ERR"; } })()');
  ev('on_mouse_lbtn_up(454, 493, 1)');
  out.inspAfterDirect = ev('(function(){ try { return String(AR.inspOn) + "/" + (AR.selAlbum ? AR.selAlbum.title : "null"); } catch(e){ return "ERR"; } })()');
  // ④ 再看 hits 里到底有哪些区（列出前 6 个 id 与坐标）
  out.hitIds = ev('(function(){ try { const l = []; for (const id of ["ar-addmusic","ar-rand","typo"]) { const a = hits.get(id); if (a) l.push(id + "@" + Math.round(a.x) + "," + Math.round(a.y)); } return l.join(" ") || "（没有已知 id）"; } catch(e){ return "ERR"; } })()');
  return JSON.stringify(out, null, 1);
})()
