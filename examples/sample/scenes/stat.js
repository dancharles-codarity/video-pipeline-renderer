// One figure, full frame. P.figure, P.label.
kit.scene('g', {
  init(kit) {
    kit.stage.append(kit.h('<div class="ground"><div class="rule st-r" style="left:200px;top:360px;width:1520px"></div>' +
      '<p class="sample-display st-f" style="position:absolute;margin:0;left:200px;top:400px">' + kit.esc(P.figure) + '</p>' +
      '<p class="sample-eyebrow eyebrow st-l" style="position:absolute;margin:0;left:200px;top:560px">' + kit.esc(P.label) + '</p></div>'));
    this.r = Q(kit, '.st-r'); this.f = Q(kit, '.st-f'); this.l = Q(kit, '.st-l');
  },
  render(t) { bar(this.r, t, 0, 0.7); rise(this.f, t, 0.3); rise(this.l, t, 0.9, 0.6, 20); },
});
