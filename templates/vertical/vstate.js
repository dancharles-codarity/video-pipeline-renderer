// Two-state build, full frame. Proven at 9.7s with the swap at 4.6s.
// P.a, P.b: {eyebrow, title, lines: [..], size, top, grad}  P.swap: state B entry time.
const A = P.a, B = P.b, SWAP = P.swap;
kit.scene('g', {
  init(kit) {
    const blk = (k, o) => '<div class="words ' + k + '" style="left:90px;top:' + o.top + 'px;width:900px">' +
      '<p class="eyebrow">' + kit.esc(o.eyebrow) + '</p>' +
      '<p class="display' + (o.grad ? ' grad-text' : '') + '" style="font-size:' + o.size + 'px">' + kit.esc(o.title) + '</p>' +
      o.lines.map((l) => '<p class="body' + (o.grad ? ' grad-soft' : ' muted') + '" style="font-size:52px">' + kit.esc(l) + '</p>').join('') + '</div>';
    kit.stage.append(kit.h('<div class="ground">' +
      '<div class="gradbar vs-bar" style="left:90px;top:520px;width:900px"></div>' +
      blk('vs-a', A) + blk('vs-b', B) + '</div>'));
    this.a = Q(kit, '.vs-a'); this.b = Q(kit, '.vs-b'); this.bar = Q(kit, '.vs-bar');
  },
  render(t) {
    bar(this.bar, t, 0.1, 0.7);
    rise(this.a, t, 0.2, 0.7, 40); fade(this.a, t, SWAP - 0.45, 0.4);
    rise(this.b, t, SWAP, 0.7, 48);
  },
});
