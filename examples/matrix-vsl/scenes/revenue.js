// Headline figure with a subtitle and a kicker.
kit.scene('g', {
  init(kit) {
    kit.stage.append(kit.h('<div class="ground"><div class="words rv-h" style="left:200px;top:200px;width:1500px"><p class="eyebrow">Within the year</p></div>' +
      '<div class="words rv-n" style="left:200px;top:280px;width:1500px;gap:10px"><p class="display grad-text" style="font-size:210px">$4.7M</p><p class="eyebrow" style="font-size:38px;color:#fff">Attributed revenue</p></div>' +
      '<div class="words rv-s" style="left:200px;top:640px;width:1500px"><p class="body muted">Tied back to field marketing</p></div>' +
      '<div class="gradbar rv-bar" style="left:200px;top:750px;width:1520px"></div>' +
      '<div class="words rv-v" style="left:200px;top:800px;width:1500px"><p class="display" style="font-size:56px">And a VP title to go with it</p></div></div>'));
    this.h = Q(kit, '.rv-h'); this.n = Q(kit, '.rv-n'); this.s = Q(kit, '.rv-s'); this.bar = Q(kit, '.rv-bar'); this.v = Q(kit, '.rv-v');
  },
  render(t) { rise(this.h, t, -0.2, 0.5, 16); rise(this.n, t, 1.2, 0.6, 48); rise(this.s, t, 3.0, 0.6, 20); bar(this.bar, t, 6.6, 0.6); rise(this.v, t, 7.0, 0.6, 30); },
});
