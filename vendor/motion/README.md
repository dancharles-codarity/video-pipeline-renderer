# Motion player files

The three files the Motion artifact type serves for every film, kept here so the renderer can run unattended instead of reading them from a live artifact each time.

| File | Bytes | sha256 |
| --- | --- | --- |
| `index.html` | 49,060 | `9aa3a9e83eddc19cdb96de80ab41e2b77b7f944bfc5dfd7b17012ea93789f546` |
| `artifact-type/app.js` | 3,450,874 | `a7fc6d212534b8b383717cf050bdc65ff9393e24777bb8e82ff2fbd47419da6c` |
| `artifact-type/app.css` | 531,540 | `acb23bf1bb9c63b98f22b0fc2c7286230ced0c1e1e63caf2894d22e52d306dbd` |

Read on 27 Oct 2026 from the "Matrix VSL - Graphics Spike" film (version `1792685847-f0fd`). The Motion type itself was at release `1793050460-cca9` that day.

They are Anthropic's Motion player, vendored for Codarity's internal use only. Do not modify them: the renderer's promise is that a frame here is the frame Motion's Export would produce.

## What the renderer uses

Only the headless entry, `index.html#tools`, which exposes `window.__animation`:

- `load({title, script, modules, assets})` takes a film and returns `{meta}` or `{error}`.
- `frame(t, {scale})` returns a PNG data URL of the frame at `t`.
- `consoleLog()` returns the film's own console output (`raster-safety:` errors, throws in `render`).

`src/browser.js` is our driver for that entry. It replaces the type's `render.mjs` (in `artifact-type/reference/render-offline.md`), which is built to inspect untrusted folders a film was sent in and so refuses to run anywhere but alone in an empty folder. Ours keeps its browser flags and its network lockdown, loads the film from memory, and streams frames straight to ffmpeg.

## Refreshing

If a film stops loading after a Motion release, read the three files again from any Motion film with the Artifact tool (`action: "read"`, `paths: ["index.html", "artifact-type/app.js", "artifact-type/app.css"]`), replace them here, update this table, and run `npm test`.
