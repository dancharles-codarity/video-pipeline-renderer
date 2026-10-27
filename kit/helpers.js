// Animation helpers prepended to every scene, client-neutral: rise, slide, fade,
// bar and Q over the Motion kit. RISE_DY is set per format by the film builder.
const { seg, eo, eob, ei, lerp } = kit;
function rise(s, t, t0, d, dy) { d = d || 0.6; dy = dy == null ? RISE_DY : dy; const p = seg(t, t0, t0 + d); s.opacity = eo(p); s.transform = 'translateY(' + lerp(dy, 0, eob(p, 1.3)) + 'px)'; }
function slide(s, t, t0, d, dx) { d = d || 0.6; dx = dx == null ? -36 : dx; const p = seg(t, t0, t0 + d); s.opacity = eo(p); s.transform = 'translateX(' + lerp(dx, 0, eo(p)) + 'px)'; }
function fade(s, t, t0, d) { const p = seg(t, t0, t0 + (d || 0.4)); s.opacity = (+s.opacity) * (1 - ei(p)); }
function bar(s, t, t0, d) { s.transform = 'scaleX(' + eo(seg(t, t0, t0 + (d || 0.5))) + ')'; }
function Q(kit, sel) { return kit.stage.querySelector(sel).style; }
