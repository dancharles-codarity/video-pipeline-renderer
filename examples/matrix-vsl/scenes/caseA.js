// Case study with a negative figure.
kit.scene('g', {
  init(kit) {
    kit.stage.append(kit.h('<div class="ground"><div class="words ca-h" style="left:200px;top:240px;width:1500px"><p class="eyebrow">Case study</p><p class="display" style="font-size:76px">$250M cybersecurity company</p></div>' +
      '<div class="gradbar ca-bar" style="left:200px;top:500px;width:1520px"></div>' +
      '<div class="words ca-n" style="left:200px;top:560px;width:1500px;gap:10px"><p class="display" style="font-size:190px">−30%</p><p class="eyebrow" style="font-size:34px;color:#fff">Events budget cut</p></div></div>'));
    this.h = Q(kit, '.ca-h'); this.bar = Q(kit, '.ca-bar'); this.n = Q(kit, '.ca-n');
  },
  render(t) { rise(this.h, t, -0.2); bar(this.bar, t, 0.2, 0.7); rise(this.n, t, 5.3, 0.6, 40); },
});
