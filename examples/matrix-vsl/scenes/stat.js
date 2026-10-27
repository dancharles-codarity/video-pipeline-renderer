// Two big figures side by side.
kit.scene('g', {
  init(kit) {
    kit.stage.append(kit.h('<div class="ground">' +
      '<div class="words st-a" style="left:240px;top:330px;width:620px"><p class="display" style="font-size:200px">24</p><p class="eyebrow" style="font-size:34px">Years</p></div>' +
      '<div class="words st-b" style="left:900px;top:330px;width:900px"><p class="display grad-text" style="font-size:200px">1,500+</p><p class="eyebrow" style="font-size:34px">Events</p></div>' +
      '<div class="words st-c" style="left:240px;top:720px;width:1400px"><p class="body muted">Under the Matrix banner</p></div>' +
      '<div class="gradbar st-bar" style="left:240px;top:300px;width:1440px"></div></div>'));
    this.a = Q(kit, '.st-a'); this.b = Q(kit, '.st-b'); this.c = Q(kit, '.st-c'); this.bar = Q(kit, '.st-bar');
  },
  render(t) { rise(this.a, t, -0.2); rise(this.b, t, 1.9); rise(this.c, t, 3.1, 0.6, 20); bar(this.bar, t, -0.2, 0.8); },
});
