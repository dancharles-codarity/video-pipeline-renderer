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
examples/sample/make-footage.sh            # synthetic footage for the sample
node bin/vpr.js stills  examples/sample/job.json
node bin/vpr.js preview examples/sample/job.json lower-third-host --reel
node bin/vpr.js master  examples/sample/job.json lower-third-host
npm test
```

Outputs go to `out/` beside the job file (`--out` to change). The sample uses a made-up design system so the repo carries nothing of any client's.

## Client-neutral by design

The renderer holds no client material: no brand stylesheets, fonts, logos, scene templates or footage. Every job brings its client's own, from where they already live:

| What | Source of truth | How a job passes it |
| --- | --- | --- |
| Tokens (colours with themes, type scale, spacing, radius, shadows) and font list | The client's Design System artifact, `project/tokens.json` | `design.tokens`, inline or as a source |
| Font files | The Design System artifact's `project/fonts/` | `design.files` (data: URIs) or `design.fontBase` |
| Motion layer (gradients, scrims, shared classes for video) | The Motion and Video section of the client's design file | `design.css` or `design.cssFile` |
| Logos and images | Bunny (`clients/{slug}/brands/...`) and the Design System | `design.assets` by name, as URLs |
| Footage and B-roll | Descript publishes and renders hosted on Bunny via the Bunny Hopper | `base` and `items[].src`, as URLs |
| Scene code | Written per video (the `video-graphics` skill) | `items[].scene.code` |

From the tokens the renderer builds the stage stylesheet, scoped to `#stage`:

- `--<token-name>` for every token in every group, with the chosen `theme` applied and `{references}` resolved (`var(--bg-page)`, `var(--accent-default)`, `var(--radius-md)`)
- `@font-face` for each font file, by family and weight, embedded as data: URIs (the one `url()` the Motion player accepts in a stylesheet)
- `--font-display`, `--font-body` and so on from `type.families`, with the body family set on the stage
- one class per type style (`.me-display-xl`, `.me-eyebrow`) setting family, size, line height, weight and tracking
- the ground behind full-frame cards from the `bg-page` token (override with `design.ground`)

Token values are checked before they reach CSS: anything that could close a rule or load a resource is refused, and a stylesheet `url()` must be a data: URI (images go in `design.assets`, read in scenes with `kit.assets.url(name)`).

## The job file

One JSON file per video. A source is an http(s) URL, a data: URI, or (local runs only) a path relative to the job file. ffmpeg reads footage URLs over HTTP ranges, so only the window it needs is downloaded.

```json
{
  "format": "landscape",
  "design": {
    "tokens": "tokens.json",
    "theme": "dark",
    "fontBase": "fonts/",
    "cssFile": "motion.css",
    "assets": { "logo-white.png": "https://codaritymedia.b-cdn.net/clients/acme/brands/logo-white.png" }
  },
  "base": "https://codaritymedia.b-cdn.net/clients/acme/video/vsl-published.mp4",
  "items": [
    { "name": "lower-third-host", "dur": 5.0, "at": 4.0, "transparent": true,
      "scene": { "file": "scenes/lower-third.js", "params": { "name": "Alex Morgan", "role": "Head of Events" } } },
    { "name": "broll-venue", "type": "broll", "src": "https://codaritymedia.b-cdn.net/clients/acme/broll/venue.mp4", "at": 9.5, "dur": 2.0, "in": 0.5, "z": 1 }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `format` | `landscape` (1920x1080) or `vertical` (1080x1920), both 30 fps. Sets canvas, still fractions (0.15, 0.5, 0.97 landscape; 0.12, 0.42, 0.62, 0.95 vertical) and the caption zone. |
| `design` | The client's design system, as above. Optional; without it scenes render in the machine's fonts on black. |
| `assets` | Per-video images or fonts beyond the design system's, by name. |
| `base` | The footage to preview over: the latest published render, or raw footage. Composition seconds in `at` are seconds into this file. Optional; without it previews run over grey. |
| `items[].at` | Placement in composition seconds. |
| `items[].dur` | Length on the timeline in seconds. |
| `items[].scene` | A graphic's code: `code` (inline) or `file`, plus optional `params`, readable in the code as `P`. |
| `items[].transparent` | Overlay with alpha (`qtrle` master) rather than a full-frame card (`libx264` master). |
| `items[].type` | `graphic` (default) or `broll`. B-roll takes `src`, `dur` and `in` (offset into the clip). |
| `items[].z` | Paint order in previews, higher on top (default 0, then by `at`). |

### Scenes

A scene is one Motion scene with the id `g`, a pure function of `t`, written against the Motion player's kit (`seg`, `eo`, `eob`, `ei`, `lerp`, `kit.h`, `kit.esc`, `kit.assets.url`). The client-neutral helpers in `kit/helpers.js` (`rise`, `slide`, `fade`, `bar`, `Q`) are prepended to every scene; set `"helpers": false` on an item to leave them out. Style with the design system's variables and classes, not hard-coded values, so the same scene works for any client.

Fonts come from the design system, never from `@font-face` rules with an http `url()` (the player rejects those and silently falls back). Keep transparent scrims small: a large semi-transparent area makes overlay masters of 100 MB or more. On vertical, the usable band is roughly y200 to y1350, and a full-frame card renders above captions, so design it to read without them.

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

Remote jobs are stricter than local ones, so a request can never read files off the server: every source (`base`, `src`, tokens, fonts, stylesheet, assets) must be an http(s) URL or a data: URI, and scenes must be inline `code`. `vpr --remote` inlines local design files and scene files for you; footage must already be on Bunny. Set `VPR_MEDIA_HOSTS=codaritymedia.b-cdn.net` to accept URLs from Bunny only.

A request carrying a full design system with eight embedded fonts is about 0.6 MB, well inside Vercel's 4.5 MB request limit.

Environment: `VPR_TOKEN` (required; with no token every request is refused), `BLOB_READ_WRITE_TOKEN` (optional), `VPR_MEDIA_HOSTS` (optional host allowlist). The function needs Vercel's 300 s duration and 3 GB memory (`vercel.json`).

On Vercel the renderer uses `@sparticuz/chromium` (Chromium 153, matched to `playwright-core` 1.63) and `ffmpeg-static`. Two things that differ from a normal Chromium, both handled in `src/browser.js`: its `--disable-web-security` flag stops the player's sandboxed iframe from loading a film, so it is dropped; and it runs `--single-process`, where closing a browser context kills the browser, so one context stays open for the whole run.

## How it works

The Motion artifact type's player (`vendor/motion/`) has a headless entry: open `index.html#tools` and it exposes `window.__animation.load(files)` and `frame(t, {scale})`. Every frame here comes from that same renderer, so a still is the frame Motion's Export would produce. `frame` at `scale: 0.5` rasterises straight at preview size, which is what makes previews cheap.

`src/design.js` turns the job's design system into the stage stylesheet; `src/film.js` builds the film in memory (scenes.json, that stylesheet, helpers plus scene code, assets). `src/ops.js` streams PNG frames into ffmpeg: overlays as `qtrle` at preview size, then one ffmpeg pass composites them over the trimmed footage with its audio. The timecode is drawn with the browser too (static ffmpeg builds often lack `drawtext`).

The scene code is ours, but the page still runs with the network blocked and only the three player files reachable, the same lockdown as the Motion type's own offline driver.

## Repo map

```
bin/vpr.js              CLI
api/render.js           Vercel function
src/browser.js          Chromium around the vendored player
src/design.js           design system (tokens.json, fonts, CSS, assets) to stage stylesheet
src/film.js             in-memory film builder
src/job.js              job loading, validation, source rules
src/ops.js              stills, preview, master
src/ffmpeg.js           ffmpeg runner, codecs
src/service.js          HTTP handler, auth, delivery
src/remote.js           CLI side of --remote
kit/helpers.js          client-neutral animation helpers
examples/sample/        a made-up design system, two scenes and a job
vendor/motion/          the Motion player files (see its README)
assets/timecode.ttf     Jost, for the preview timecode
```
