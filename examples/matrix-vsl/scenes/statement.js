// Two-line statement, gradient on the payoff word.
kit.scene('g', {
  init(kit) {
    kit.stage.append(kit.h('<div class="ground"><div class="words sm-a" style="left:200px;top:330px;width:1600px"><p class="display" style="font-size:100px">Not a cost center.</p></div>' +
      '<div class="words sm-b" style="left:200px;top:500px;width:1600px"><p class="display" style="font-size:100px">A growth <span class="grad-text">lever.</span></p></div>' +
      '<div class="gradbar sm-bar" style="left:200px;top:290px;width:1520px"></div></div>'));
    this.a = Q(kit, '.sm-a'); this.b = Q(kit, '.sm-b'); this.bar = Q(kit, '.sm-bar');
  },
  render(t) { rise(this.a, t, -0.2); rise(this.b, t, 2.3, 0.6, 40); bar(this.bar, t, -0.2, 0.8); },
});
