// Logo strip, lower third. Transparent.
// P.logos: [[asset name, entry time], ...] up to three, white logos cropped to their bounding box.
const L = P.logos;
kit.scene('g', {
  init(kit) {
    let h = '<div class="clear"><div class="clear lg-grp"><div class="panel lg-panel" style="left:330px;top:852px;width:1260px;height:150px"></div><div class="gradbar lg-bar" style="left:330px;top:836px;width:1260px"></div>';
    L.forEach((l, i) => { h += '<img class="lg-' + i + '" src="' + kit.assets.url(l[0]) + '" style="position:absolute;left:' + (370 + i * 410) + 'px;top:897px;height:60px;width:360px;object-fit:contain">'; });
    kit.stage.append(kit.h(h + '</div></div>'));
    this.g = Q(kit, '.lg-grp'); this.p = Q(kit, '.lg-panel'); this.b = Q(kit, '.lg-bar'); this.l = L.map((l, i) => Q(kit, '.lg-' + i));
  },
  render(t, kit) {
    const p = eo(seg(t, 0, 0.4)); this.p.opacity = p; this.p.transform = 'translateY(' + lerp(24, 0, p) + 'px)';
    bar(this.b, t, 0.05, 0.5);
    this.l.forEach((s, i) => rise(s, t, L[i][1], 0.5, 18));
    this.g.opacity = 1 - ei(seg(t, kit.dur - 0.6, kit.dur - 0.2));
  },
});
