kit.scene('g', {
  init(kit) {
    kit.stage.append(kit.h(
      '<div class="sc" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">' +
        '<div class="sc-eyebrow me-eyebrow" style="color:var(--accent-default);text-transform:uppercase;margin-bottom:32px">Within the year</div>' +
        '<div class="sc-fig me-display-xl" style="font-size:200px;line-height:1;background:linear-gradient(90deg, var(--me-cyan), var(--me-blue), var(--me-purple));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;padding:0 12px">$4.7M</div>' +
        '<div class="sc-sub" style="color:var(--fg-2);font-size:40px;margin-top:36px">Tied back to field marketing</div>' +
      '</div>'));
    this.wrap = Q(kit, '.sc'); this.eb = Q(kit, '.sc-eyebrow'); this.fig = Q(kit, '.sc-fig'); this.sub = Q(kit, '.sc-sub');
  },
  render(t, kit) {
    rise(this.eb, t, 0.1, 0.5, 24);
    const a = eo(seg(t, 0.3, 1.0));
    this.fig.opacity = a;
    this.fig.transform = 'translateY(' + lerp(40, 0, a) + 'px) scale(' + lerp(0.94, 1, a) + ')';
    rise(this.sub, t, 0.8, 0.6, 24);
    this.wrap.opacity = 1 - ei(seg(t, kit.dur - 0.5, kit.dur));
  },
});
