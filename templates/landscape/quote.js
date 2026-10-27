// Full-frame pull quote, sentences revealed in turn.
// P.sentences: [[text, entry time], ...]  P.who: attribution  P.size: body px
// P.barY, P.whoY: gradient bar and attribution y positions.
const S = P.sentences, WHO = P.who;
kit.scene('g', {
  init(kit) {
    let h = '<div class="ground"><div class="display grad-text qt-mark" style="position:absolute;left:200px;top:150px;font-size:240px;line-height:1">“</div>' +
      '<p class="words" style="left:200px;top:360px;width:1500px;display:block">';
    S.forEach((s, i) => { h += '<span class="body qt-s' + i + '" style="display:inline;font-size:' + P.size + 'px;line-height:1.45">' + kit.esc(s[0]) + ' </span>'; });
    h += '</p>';
    h += '<div class="gradbar qt-bar" style="left:200px;top:' + P.barY + 'px;width:120px"></div><div class="words qt-who" style="left:200px;top:' + P.whoY + 'px;width:1500px"><p class="eyebrow" style="font-size:30px">' + kit.esc(WHO) + '</p></div></div>';
    kit.stage.append(kit.h(h));
    this.s = S.map((s, i) => Q(kit, '.qt-s' + i)); this.m = Q(kit, '.qt-mark'); this.w = Q(kit, '.qt-who'); this.bar = Q(kit, '.qt-bar');
  },
  render(t) {
    rise(this.m, t, -0.2, 0.6, 20);
    this.s.forEach((st, i) => { st.opacity = eo(seg(t, S[i][1], S[i][1] + 0.6)); });
    bar(this.bar, t, 0.2); rise(this.w, t, 0.3, 0.6, 16);
  },
});
