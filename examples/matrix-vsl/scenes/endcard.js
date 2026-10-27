// Logo, call to action, book line. Needs the asset matrix-side-white.png.
kit.scene('g', {
  init(kit) {
    kit.stage.append(kit.h('<div class="ground"><img class="ec-logo" src="' + kit.assets.url('matrix-side-white.png') + '" style="position:absolute;left:200px;top:170px;height:110px">' +
      '<div class="words ec-a" style="left:200px;top:400px;width:1600px"><p class="display" style="font-size:96px">30-minute call.</p></div>' +
      '<div class="words ec-b" style="left:200px;top:530px;width:1600px"><p class="display grad-text" style="font-size:96px">No pitch.</p></div>' +
      '<div class="gradbar ec-bar" style="left:200px;top:700px;width:1520px"></div>' +
      '<div class="words ec-c" style="left:200px;top:750px;width:1500px"><p class="body" style="font-size:44px;font-weight:600">Book your time below.</p></div></div>'));
    this.l = Q(kit, '.ec-logo'); this.a = Q(kit, '.ec-a'); this.b = Q(kit, '.ec-b'); this.bar = Q(kit, '.ec-bar'); this.c = Q(kit, '.ec-c');
  },
  render(t) { rise(this.l, t, -0.2, 0.6, 16); rise(this.a, t, 0.2); rise(this.b, t, 0.7); bar(this.bar, t, 1.0, 0.7); rise(this.c, t, 1.4, 0.6, 20); },
});
