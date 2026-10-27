// Three-step build, full frame. Proven at 6.0s: cards at y560, y840, y1120, last ends y1350.
// P.steps: [[number, label], ...]  P.head: [eyebrow, title].
const ST = P.steps, HEAD = P.head;
kit.scene('g', {
  init(kit) {
    let h = '<div class="ground"><div class="words vp-h" style="left:90px;top:280px;width:900px">' +
      '<p class="eyebrow">' + kit.esc(HEAD[0]) + '</p>' +
      '<p class="display" style="font-size:86px">' + kit.esc(HEAD[1]) + '</p></div>' +
      '<div class="gradbar vp-bar" style="left:90px;top:500px;width:900px"></div>';
    ST.forEach((s, i) => {
      h += '<div class="card vp-c' + i + '" style="left:90px;top:' + (560 + i * 280) + 'px;width:900px;height:230px">' +
        '<div class="words" style="left:50px;top:44px;width:800px;gap:18px">' +
        '<p class="display grad-text" style="font-size:58px">' + s[0] + '</p>' +
        '<p class="body" style="font-size:50px;font-weight:600;line-height:1.25">' + kit.esc(s[1]) + '</p>' +
        '</div></div>';
    });
    kit.stage.append(kit.h(h + '</div>'));
    this.h = Q(kit, '.vp-h'); this.bar = Q(kit, '.vp-bar'); this.c = ST.map((s, i) => Q(kit, '.vp-c' + i));
  },
  render(t) { rise(this.h, t, -0.1, 0.7, 30); bar(this.bar, t, 0.3, 0.8); this.c.forEach((s, i) => rise(s, t, 0.9 + i * 0.75, 0.65, 56)); },
});
