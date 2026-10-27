// Prepended to every scene, helpers or not. Inline styles that use var() lose
// their values in the frame rasteriser once render() changes the element:
// Chromium cannot re-serialise a shorthand such as
// `background: linear-gradient(var(--a), var(--b))` next to a longhand such as
// `background-clip: text`, so the gradient comes back empty. After init, every
// inline var() is resolved to its computed value; tokens do not change mid-film.
(function () {
  const define = kit.scene;
  function settle(root) {
    for (const el of root.querySelectorAll('[style*="var("]')) {
      const computed = getComputedStyle(el);
      for (const p of Array.from(el.style)) {
        const v = el.style.getPropertyValue(p);
        if (v === '' || v.includes('var(')) el.style.setProperty(p, computed.getPropertyValue(p), el.style.getPropertyPriority(p));
      }
    }
  }
  kit.scene = function (id, def) {
    if (def && typeof def.init === 'function') {
      const init = def.init;
      def.init = function (k) {
        const r = init.apply(this, arguments);
        if (r && typeof r.then === 'function') return r.then((v) => { settle(k.stage); return v; });
        settle(k.stage);
        return r;
      };
    }
    return define.apply(this, arguments);
  };
})();
