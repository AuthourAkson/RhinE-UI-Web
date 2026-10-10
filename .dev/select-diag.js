(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  const rowSel = () => ev('(function(){ try { const r = AR.rows.get(AR.group); return r ? ("sel=" + r.sel + " 组内专辑=" + (typeof G !== "undefined" && G[AR.group] ? G[AR.group].albums.map(a=>a.title).join("|") : "?")) : "无行"; } catch(e){ return "ERR " + e.message; } })()');
  const out = { before: rowSel(), hover: ev('String(AR.hover)'), inspOn: ev('String(AR.inspOn)') };
  // 模拟：先悬停到第 2 张，再点击
  ev('on_mouse_move(454, 493, 0)');
  out.hoverAtCase = ev('String(AR.hover)');
  ev('on_mouse_lbtn_up(454, 493, 1)');
  out.afterClickSel = rowSel();
  out.afterClickInsp = ev('String(AR.inspOn)');
  // 再点一次同一位置 → 应该进入"检视"（把外壳拿出来放到中央）
  ev('on_mouse_lbtn_up(454, 493, 1)');
  out.afterSecondClickInsp = ev('String(AR.inspOn)');
  out.inspDetails = ev('(function(){ try { return AR.insp ? JSON.stringify({ lift: AR.insp.lift, title: AR.insp.a && AR.insp.a.title }) : "null"; } catch(e){ return "ERR"; } })()');
  return JSON.stringify(out, null, 1);
})()
