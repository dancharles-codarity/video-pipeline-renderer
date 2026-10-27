// Name and role, lower left. Transparent overlay. P.name, P.role.
kit.scene('g', {
  init(kit) {
    kit.stage.append(kit.h('<div class="clear lt-g"><div class="panel lt-p" style="left:110px;top:800px;width:900px;height:170px"></div>' +
      '<div class="rule lt-r" style="left:150px;top:830px;width:200px"></div>' +
      '<p class="sample-body lt-n" style="position:absolute;margin:0;left:150px;top:855px">' + kit.esc(P.name) + '</p>' +
      '<p class="sample-eyebrow eyebrow lt-o" style="position:absolute;margin:0;left:150px;top:912px">' + kit.esc(P.role) + '</p></div>'));
    this.g = Q(kit, '.lt-g'); this.p = Q(kit, '.lt-p'); this.r = Q(kit, '.lt-r'); this.n = Q(kit, '.lt-n'); this.o = Q(kit, '.lt-o');
  },
  render(t, kit) {
    slide(this.p, t, 0, 0.45, -30); bar(this.r, t, 0.15, 0.5); rise(this.n, t, 0.25, 0.5, 18); rise(this.o, t, 0.45, 0.5, 18);
    this.g.opacity = 1 - ei(seg(t, kit.dur - 0.5, kit.dur - 0.1));
  },
});
