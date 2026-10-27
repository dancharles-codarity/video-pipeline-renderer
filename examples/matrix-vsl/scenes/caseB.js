// The outcome half of the same story.
kit.scene('g', {
  init(kit) {
    kit.stage.append(kit.h('<div class="ground"><div class="words cb-h" style="left:200px;top:220px;width:1500px"><p class="eyebrow">Within 2 quarters</p></div>' +
      '<div class="words cb-n" style="left:200px;top:300px;width:1500px;gap:10px"><p class="display grad-text" style="font-size:220px">+50%</p><p class="eyebrow" style="font-size:38px;color:#fff">Qualified pipeline</p></div>' +
      '<div class="gradbar cb-bar" style="left:200px;top:700px;width:1520px"></div>' +
      '<div class="words cb-r" style="left:200px;top:750px;width:1500px"><p class="body" style="font-size:44px;font-weight:600">Budget restored. Program expanded.</p></div></div>'));
    this.h = Q(kit, '.cb-h'); this.n = Q(kit, '.cb-n'); this.bar = Q(kit, '.cb-bar'); this.r = Q(kit, '.cb-r');
  },
  render(t) { rise(this.h, t, -0.2, 0.5, 16); rise(this.n, t, 1.8, 0.6, 48); bar(this.bar, t, 2.2, 0.7); rise(this.r, t, 4.7, 0.6, 24); },
});
