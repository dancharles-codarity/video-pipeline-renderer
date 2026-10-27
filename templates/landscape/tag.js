// Stage tag overlay, top left. Transparent.
// P.n: stage number  P.of: total stages (default 4)  P.title: the stage label.
const N = P.n, OF = P.of || 4, TITLE = P.title;
kit.scene('g', {
  init(kit) {
    const w = Math.floor(840 / OF);
    let segs = ''; for (let i = 0; i < OF; i++) segs += '<div style="position:absolute;left:' + (i * w) + 'px;top:0;width:' + (w - 12) + 'px;height:6px;border-radius:3px;background:' + (i < N ? 'var(--grad)' : 'rgba(255,255,255,.18)') + '"></div>';
    const pad = (x) => (x < 10 ? '0' : '') + x;
    kit.stage.append(kit.h('<div class="clear tg-g"><div class="panel tg-p" style="left:110px;top:100px;width:920px;height:170px"></div>' +
      '<div class="tg-bar" style="position:absolute;left:150px;top:132px;width:840px;height:6px">' + segs + '</div>' +
      '<div class="words tg-w" style="left:150px;top:160px;width:860px;gap:12px"><p class="eyebrow" style="font-size:22px">Stage ' + pad(N) + ' of ' + pad(OF) + '</p><p class="display" style="font-size:34px">' + kit.esc(TITLE) + '</p></div></div>'));
    this.g = Q(kit, '.tg-g'); this.p = Q(kit, '.tg-p'); this.b = Q(kit, '.tg-bar'); this.w = Q(kit, '.tg-w');
  },
  render(t, kit) {
    slide(this.p, t, 0.05, 0.45, -30); bar(this.b, t, 0.15, 0.5); slide(this.w, t, 0.25, 0.5, 24);
    this.g.opacity = 1 - ei(seg(t, kit.dur - 0.6, kit.dur - 0.2));
  },
});
