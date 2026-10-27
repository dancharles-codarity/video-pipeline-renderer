// Four numbered cards in a row.
const ST = [['01', 'Vision and objective alignment'], ['02', 'Exhaustive pre-production'], ['03', 'Live execution'], ['04', 'Post-event evaluation']];
kit.scene('g', {
  init(kit) {
    let h = '<div class="ground"><div class="words fw-h" style="left:150px;top:200px;width:1600px"><p class="eyebrow">Our process</p><p class="display" style="font-size:72px">4 stages</p></div>';
    ST.forEach((s, i) => { h += '<div class="card fw-c' + i + '" style="left:' + (150 + i * 412) + 'px;top:440px;width:380px;height:380px"><div class="words" style="left:36px;top:40px;width:310px;gap:26px"><p class="display grad-text" style="font-size:64px">' + s[0] + '</p><p class="body" style="font-size:34px;line-height:1.3;font-weight:600">' + kit.esc(s[1]) + '</p></div></div>'; });
    h += '<div class="gradbar fw-bar" style="left:150px;top:860px;width:1612px"></div></div>';
    kit.stage.append(kit.h(h));
    this.h = Q(kit, '.fw-h'); this.c = ST.map((s, i) => Q(kit, '.fw-c' + i)); this.bar = Q(kit, '.fw-bar');
  },
  render(t) { rise(this.h, t, -0.2); this.c.forEach((s, i) => rise(s, t, 0.4 + i * 0.45, 0.6, 48)); bar(this.bar, t, 0.4, 2.0); },
});
