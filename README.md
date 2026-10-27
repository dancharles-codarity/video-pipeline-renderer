# Video pipeline renderer

The cheap way to check that a motion graphic or a piece of B-roll lands where it should, **before** it is placed on the Descript timeline.

Bouncing the whole video out of Descript to check one placement takes 6 to 10 minutes a round. A preview here takes seconds: just the window around the item, at low resolution and frame rate, laid over the real footage with its audio, and the composition timecode in the corner so notes can say exactly where. Once it looks right, render the graphic's file and place it. Descript renders the finished video; this tool never does.

## Where it sits in the review ladder

Cheapest first. Everything here happens before placement.

| Step | Command | Cost | What it catches |
| --- | --- | --- | --- |
| Stills | `vpr stills` | ~1 s per graphic, free | Layout, type, text over the face (composited over the real frame), vertical caption clearance (red box at y1380 to y1520) |
| Preview | `vpr preview` | ~5 to 10 s per item, free | Whether a reveal lands on the right word, B-roll timing, how neighbouring items sit together |
| Master | `vpr master` | ~0.2 s per frame | The file that gets placed: `qtrle`/`argb` `.mov` for transparent overlays, `libx264` CRF 16 `.mp4` for full-frame cards |
| Place in Descript | | 8 to 14 credits | |
| Publish | | 6 to 10 minutes | |

## Quick start

Needs Node 22+, ffmpeg and a Chromium (in Claude Code cloud sessions all three are already there).

```bash
npm install
node bin/vpr.js stills  examples/matrix-shorts/job.json
node bin/vpr.js preview examples/matrix-vsl/job.json stage-1-vision pain-referee --reel
node bin/vpr.js master  examples/matrix-vsl/job.json stage-1-vision
npm test
```

Outputs go to `out/` beside the job file (`--out` to change). The examples expect footage in their `footage/` folder, which is not committed: drop in the published Descript render, or point `base` at its URL.

## The job file

One JSON file per video. Relative paths resolve against the job file's folder; URLs are fetched (ffmpeg reads only the window it needs over HTTP).

```json
{
  "format": "landscape",
  "brand": "matrix-events",
  "base": "footage/published.mp4",
  "assets": { "matrix-side-white.png": "https://codaritymedia.b-cdn.net/clients/matrix-events/..." },
  "items": [
    { "name": "stage-1-vision", "dur": 5.0, "at": 252.7, "transparent": true,
      "scene": { "template": "landscape/tag", "params": { "n": 1, "title": "Vision and objective alignment" } } },
    { "name": "stat-24-years", "dur": 6.0, "at": 65.1, "scene": { "file": "scenes/stat.js" } },
    { "name": "broll-desk", "type": "broll", "src": "footage/broll-desk.mp4", "at": 255.0, "dur": 4.0, "in": 0.5, "z": 1 }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `format` | `landscape` (1920x1080) or `vertical` (1080x1920), both 30 fps. Sets canvas, still fractions (0.15, 0.5, 0.97 landscape; 0.12, 0.42, 0.62, 0.95 vertical) and the caption zone. |
| `brand` | A folder under `brands/` (or a path to one) with `brand.json`, a stylesheet per format and the font files. |
| `base` | The footage to preview over: the latest published render, or raw footage. Composition seconds in `at` are seconds into this file. Optional; without it previews run over grey. |
| `assets` | Extra images or fonts the scenes use, by name (`kit.assets.url(name)` in scene code). |
| `items[].at` | Placement in composition seconds. |
| `items[].dur` | Length on the timeline in seconds. |
| `items[].scene` | A graphic's code: `template` + `params`, a `file`, or inline `code`. |
| `items[].transparent` | Overlay with alpha (`qtrle` master) rather than a full-frame card (`libx264` master). |
| `items[].type` | `graphic` (default) or `broll`. B-roll takes `src`, `dur` and `in` (offset into the clip). |
| `items[].z` | Paint order in previews, higher on top (default 0, then by `at`). |

### Scenes

A scene is one Motion scene with the id `g`, a pure function of `t`, written against the Motion player's kit (`seg`, `eo`, `eob`, `ei`, `lerp`, `kit.h`, `kit.esc`, `kit.assets.url`). The helpers `rise`, `slide`, `fade`, `bar` and `Q` are prepended to every scene (`templates/_helper.js`). Templates read their parameters from `P`.

| Template | Format | Use |
| --- | --- | --- |
| `landscape/tag` | 16:9 overlay | Stage tag, top left: `n`, `of`, `title` |
| `landscape/kinetic` | 16:9 overlay | Kinetic lines right of frame behind a scrim: `items`, `top` |
| `landscape/logos` | 16:9 overlay | Logo strip, lower third: `logos` as `[asset, entry time]` |
| `landscape/quote` | 16:9 card | Pull quote revealed by sentence: `sentences`, `who`, `size`, `barY`, `whoY` |
| `vertical/vstate` | 9:16 card | Two-state build: `a`, `b`, `swap` |
| `vertical/vsteps` | 9:16 card | Three-step build: `steps`, `head` |

One-off cards live with the job (see `examples/matrix-vsl/scenes/`).

Brand rules carried from rep 1: one gradient moment per frame; display face in caps for headlines, body face for everything else; full cyan-to-purple gradient for headlines only, `.grad-soft` on body-size text. Keep scrims small: a large semi-transparent area makes overlay masters of 100 MB or more. On vertical, the usable band is roughly y200 to y1350; a full-frame card renders above captions, so design it to read without them.

Fonts come from the brand pack's files, never from `@font-face` rules with `url()` in a stylesheet (the player rejects those and silently falls back).

## CLI

```
vpr <stills|preview|master> <job.json> [names...]
    --out <dir>          output folder (default: out/ beside the job)
    --fps <n>            preview frame rate (default 12)
    --scale <x>          preview scale (default 0.5: 960x540 or 540x960)
    --pad <s>            seconds of footage either side of the item (default 1.0)
    --reel               preview: also join the clips into preview-reel.mp4
    --no-timecode        preview: leave out the timecode
    --concurrency <n>    graphics rendered in parallel (default 3)
    --json               print the result as JSON
    --remote <url>       run on the deployed service (needs VPR_TOKEN)
```

Names select items; with none, every item is processed. A preview window shows every item that overlaps it, so neighbours land as they will.

## The service

The same three operations over HTTP, for Cowork or anything else that cannot run Chromium. Deployed as one Vercel function (`api/render.js`), the same shape as the Bunny upload service.

```
POST /api/render
Authorization: Bearer <VPR_TOKEN>
{ "op": "preview", "job": { ...as above... }, "names": ["stage-1-vision"], "options": { "fps": 12, "scale": 0.5, "reel": false } }
```

Returns `{ op, ms, result, files }`. Each file is either a `url` (when `BLOB_READ_WRITE_TOKEN` is set, uploaded to Vercel Blob) or inline `base64` (up to about 3.5 MB in total, enough for a few previews or stills).

Remote jobs are stricter than local ones, so a request can never read files off the server: `base`, `src` and `assets` must be http(s) URLs, `brand` must be a bundled brand name, and scenes must be a template or inline `code`. `vpr --remote` inlines scene files for you.

Environment: `VPR_TOKEN` (required; with no token every request is refused), `BLOB_READ_WRITE_TOKEN` (optional). The function needs Vercel's 300 s duration and 3 GB memory (`vercel.json`).

On Vercel the renderer uses `@sparticuz/chromium` (Chromium 153, matched to `playwright-core` 1.63) and `ffmpeg-static`. Two things that differ from a normal Chromium, both handled in `src/browser.js`: its `--disable-web-security` flag stops the player's sandboxed iframe from loading a film, so it is dropped; and it runs `--single-process`, where closing a browser context kills the browser, so one context stays open for the whole run.

## How it works

The Motion artifact type's player (`vendor/motion/`) has a headless entry: open `index.html#tools` and it exposes `window.__animation.load(files)` and `frame(t, {scale})`. Every frame here comes from that same renderer, so a still is the frame Motion's Export would produce. `frame` at `scale: 0.5` rasterises straight at preview size, which is what makes previews cheap.

`src/film.js` builds the film in memory (scenes.json, the brand stylesheet, helpers plus scene code, fonts and assets). `src/ops.js` streams PNG frames into ffmpeg: overlays as `qtrle` at preview size, then one ffmpeg pass composites them over the trimmed footage with its audio. The timecode is drawn with the browser too (static ffmpeg builds often lack `drawtext`).

The scene code is ours, but the page still runs with the network blocked and only the three player files reachable, the same lockdown as the Motion type's own offline driver.

## Repo map

```
bin/vpr.js              CLI
api/render.js           Vercel function
src/browser.js          Chromium around the vendored player
src/film.js             in-memory film builder, template loading
src/job.js              job file loading and validation
src/ops.js              stills, preview, master
src/ffmpeg.js           ffmpeg runner, codecs
src/service.js          HTTP handler, auth, delivery
src/remote.js           CLI side of --remote
templates/              reusable scene templates and the helper kit
brands/matrix-events/   stylesheets per format and fonts
examples/               the Matrix VSL and shorts jobs
vendor/motion/          the Motion player files (see its README)
assets/timecode.ttf     Jost, for the preview timecode
```
