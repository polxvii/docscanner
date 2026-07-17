# DocScanner

A browser-based document scanner (like CamScanner, **no watermark** on exports).
Runs entirely client-side — no backend, no accounts. Built with React + Vite.

See [`scanner-app-spec.md`](./scanner-app-spec.md) for the full spec.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed URL. The dev server is exposed on your LAN (`host: true`)
so you can test the camera from a phone — but note:

> **The camera requires HTTPS or `localhost`.** Opening the LAN URL over plain
> `http://<ip>` will block `getUserMedia`. For phone testing use a tunnel
> (e.g. `ngrok`, `cloudflared`) or deploy to Netlify / Vercel / GitHub Pages.

```bash
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

## Libraries

| Library          | How it's loaded         | Used for                          |
| ---------------- | ----------------------- | --------------------------------- |
| jsPDF            | npm                     | PDF export                        |
| Tesseract.js     | npm                     | OCR (`tha+eng`)                   |
| idb              | npm                     | IndexedDB persistence             |

> **No OpenCV.** The perspective crop/warp and all filters are implemented in
> plain JavaScript / canvas (`src/lib/imaging.js`). The 11MB OpenCV.js WASM
> proved unreliable to load on real devices (it would hang on "Loading
> detector"), so it was removed. The app now loads instantly and works on any
> phone. Trade-off: no live auto edge-detection while aiming — instead you
> capture, then drag a crop box (seeded by a lightweight pure-JS auto-detect)
> onto the document.

## Build phases

Implemented incrementally per the spec. All 11 phases built:

- [x] **1. Project setup** — Vite + React, library loading, app runs.
- [x] **2. Camera + capture** — live video, full-res capture, gallery upload,
      framing guide. (Live OpenCV auto-detection removed — see note above.)
- [x] **3. Crop & adjust** — draggable corner + edge handles, Auto Crop (pure-JS
      detect) / All / rotate, pure-JS perspective warp on confirm.
- [x] **4. Filters** — Original / Grayscale / B&W (adaptive threshold) / Magic
      Color, with live previews.
- [x] **5. Page viewer** — multi-page list, reorder (drag + arrows), delete,
      non-destructive re-edit (originals + corners + filter kept).
- [x] **6. Persistence** — IndexedDB via idb (documents, folders, signatures).
- [x] **7. Library + folders** — folder chips, document grid, rename /
      duplicate / delete.
- [x] **8. Annotations** — text + signature, drag / resize / rotate, per-item
      this-page / all-pages scope, ratio-based positions.
- [x] **9. Signatures** — draw or upload, background removal with threshold +
      softness sliders, save/reuse tray.
- [x] **10. OCR** — Tesseract `tha+eng`, opt-in per page, progress indicator.
- [x] **11. Export** — no-watermark PDF (A4 / Letter / fit, orientation),
      JPG / PNG, Web Share with download fallback.

### Verification status

Verified in-browser (this environment): library, folder create + IndexedDB
persistence across reload, document load, page viewer, page detail, add text
annotation (ratio storage + persistence), scope toggle, no-watermark PDF export
with annotation compositing. Pure logic (coordinate mapping, signature alpha
ramp, corner rotation) covered by Node tests.

Needs a real device (camera + OpenCV WASM don't run in the CI sandbox browser):
live detection overlay, crop warp, filter apply, auto-crop, OCR, signature
background-removal preview. Run `npm run dev` on `localhost` to exercise these.

## Architecture notes (phase 2)

Three coordinate spaces are kept explicit to avoid alignment bugs:

1. **Video native** — `video.videoWidth × videoHeight`.
2. **Detection** — a downscaled offscreen canvas (~300px wide). Detection runs
   here only; corners are returned **normalised (0..1)**.
3. **Display** — the `<video>` element's rendered size. The overlay maps
   normalised corners into the letterboxed content rect (`object-fit: contain`).

Every OpenCV `Mat` allocated in `src/lib/detectDocument.js` is released in a
`finally` block — leaks crash long multi-page sessions.
