// Side overlay, right of frame behind a scrim. Transparent.
// P.items: [[html, entry time, class?, size?, exit time?], ...]  P.top: y of the first line (default 380).
const IT = P.items, TOP = P.top == null ? 380 : P.top;
kit.scene('g', {
  init(kit) {
    let h = '<div class="clear kn-g"><div class="clear kn-scrim" style="background:linear-gradient(270deg, rgba(6,6,20,.85) 0%, rgba(6,6,20,.6) 30%, rgba(6,6,20,0) 50%)"></div>' +
      '<div class="gradbar kn-bar" style="left:1250px;top:' + (TOP - 34) + 'px;width:140px"></div><div class="words" style="left:1250px;top:' + TOP + 'px;width:600px;gap:22px">';
    IT.forEach((it, i) => { h += '<p class="' + (it[2] || 'display') + ' kn-' + i + '" style="font-size:' + (it[3] || 64) + 'px">' + it[0] + '</p>'; });
    kit.stage.append(kit.h(h + '</div></div>'));
    this.g = Q(kit, '.kn-g'); this.s = Q(kit, '.kn-scrim'); this.b = Q(kit, '.kn-bar'); this.i = IT.map((it, i) => Q(kit, '.kn-' + i));
  },
  render(t, kit) {
    this.s.opacity = eo(seg(t, 0, 0.4)); bar(this.b, t, 0.05, 0.4);
    this.i.forEach((s, i) => { slide(s, t, IT[i][1], 0.45, 40); if (IT[i][4] != null) { const o = ei(seg(t, IT[i][4], IT[i][4] + 0.3)); s.opacity = (+s.opacity) * (1 - o); } });
    this.g.opacity = 1 - ei(seg(t, kit.dur - 0.5, kit.dur - 0.15));
  },
});
