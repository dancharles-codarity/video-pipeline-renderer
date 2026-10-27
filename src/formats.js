// Per-format settings. Geometry that varies by canvas lives here, never in a
// template or a brand pack, so landscape and vertical share one code path.
export const FORMATS = {
  landscape: {
    width: 1920, height: 1080, fps: 30,
    stills: [0.15, 0.5, 0.97],
    riseDy: 36,
    captionZone: null,
  },
  vertical: {
    width: 1080, height: 1920, fps: 30,
    // Four points: vertical cards carry a mid-sequence reveal three can miss.
    stills: [0.12, 0.42, 0.62, 0.95],
    riseDy: 42,
    // Drawn on QC stills so caption clearance shows at review, not in the render.
    captionZone: { y0: 1380, y1: 1520 },
  },
};

export const PREVIEW_DEFAULTS = { fps: 12, scale: 0.5, pad: 1.0, crf: 28 };

export function format(name) {
  const f = FORMATS[name];
  if (!f) throw new Error(`unknown format "${name}" (expected ${Object.keys(FORMATS).join(' or ')})`);
  return f;
}
