(() => {
  const w = document.querySelector('iframe[data-id="stage"]').contentWindow;
  const out = {};
  try {
    // 直接测主题真正用的那条 spec
    out.tfTrack = w.eval(`(function(){
      try {
        const list = fb.GetLibraryItems();
        if (!list.Count) return "库为空";
        const h = list.Item(0);
        const tf = fb.TitleFormat("[%tracknumber%]\\u0001%title%\\u0001[%length_seconds%]");
        return JSON.stringify({ count: list.Count, h0: { id: h && h.__id, len: h && h.Length }, eval: tf.EvalWithMetadb(h) });
      } catch (e) { return "ERR " + e.message; }
    })()`);
    out.tfAlbum = w.eval(`(function(){
      try {
        const tf = fb.TitleFormat("[%album%]\\u0001%path%");
        const list = fb.GetLibraryItems();
        const r = tf.EvalWithMetadbs(list);
        return JSON.stringify({ n: r.length, first: r[0] });
      } catch (e) { return "ERR " + e.message; }
    })()`);
    out.themeItems = w.eval(`(function(){
      try { return JSON.stringify({ n: LIB.items ? LIB.items.length : -1, first: LIB.items && LIB.items[0] ? {t: LIB.items[0].title, l: LIB.items[0].length} : null }); }
      catch (e) { return "ERR " + e.message; }
    })()`);
    out.catalogFirstItem = (() => { const c = w.__RHINE_CATALOG__; return c && c.items[0] ? { title: c.items[0].title, length: c.items[0].length, ord: c.items[0].ord } : null; })();
    out.tagsParserLoaded = w.eval(`typeof parseTags !== "undefined" ? "yes" : "no"`);
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out, null, 1);
})()
