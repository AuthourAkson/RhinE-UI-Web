(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const ev = (e) => { try { return w.eval(e); } catch (err) { return 'ERR: ' + err.message; } };
  return JSON.stringify({
    hit0: ev('(function(){ try { return JSON.stringify(AR.hits[0]); } catch(e){ return "ERR " + e.message; } })()'),
    hitCount: ev('typeof AR !== "undefined" && AR.hits ? AR.hits.length : -1'),
    // 卡片当前显示的专辑（点对之后应该换）
    cardKey: ev('(function(){ try { return AR.tracks && AR.tracks.key ? AR.tracks.key.slice(0, 40) : "无"; } catch(e){ return "ERR"; } })()'),
    // 所有 AR.hits 的键
    hitKeys: ev('(function(){ try { return JSON.stringify(AR.hits.map(h => Object.keys(h).join("/"))); } catch(e){ return "ERR"; } })()'),
    // 直接问：某个坐标下主题认为命中了什么（stage 自己的 hits 对象）
    at_400_560: ev('(function(){ try { const a = hits.at(400,560); return a ? a.id : "无"; } catch(e){ return "ERR " + e.message; } })()'),
    // AR 里所有跟"选中/检视"有关的状态
    arState: ev('(function(){ try { return JSON.stringify(Object.keys(AR)); } catch(e){ return "ERR"; } })()'),
    inspectKey: ev('(function(){ try { return typeof AR.inspect === "object" && AR.inspect ? JSON.stringify(AR.inspect) : String(AR.inspect); } catch(e){ return "ERR"; } })()'),
  }, null, 1);
})()
