# DocScanner

A browser-based document scanner (like CamScanner, **no watermark** on exports).
Runs entirely client-side — no backend, no accounts, no API keys. Built with
React + Vite.

- **Live:** https://docscanner-7lj.pages.dev
- **Full architecture + handoff guide:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- **Visual diagrams (offline HTML):** [`docs/architecture.html`](./docs/architecture.html)
- **Original spec:** [`scanner-app-spec.md`](./scanner-app-spec.md)
- **Deploy / change accounts:** [`DEPLOY.md`](./DEPLOY.md)

## Getting started

```bash
npm install
npm run dev
```

Open the printed URL. The dev server is exposed on your LAN (`host: true`) so you
can test the camera from a phone — but note:

> **The camera requires HTTPS or `localhost`.** Opening the LAN URL over plain
> `http://<ip>` blocks `getUserMedia`. For phone testing use a tunnel (ngrok,
> cloudflared) or the deployed HTTPS URL.

```bash
npm run build     # production build → dist/
npm run preview   # serve the production build locally
```

## Features

- **Capture** — camera scan with **tap-to-focus**, gallery upload, or PDF import.
- **Crop** — drag corner/edge handles, magnifier loupe, rotate, **tilt-aware
  auto-detect**, pure-JS perspective de-skew.
- **Enhance** — filters (Grayscale / B&W / Magic Color / Lighten) + intensity,
  manual adjust (brightness / contrast / white balance / sharpness / clarity),
  one-tap **✨ Enhance**, pinch-zoom.
- **Organize** — folders, multi-page documents, 2-column grid, drag-reorder,
  multi-select export/delete.
- **Annotate** — text, signatures, overlaid images; drag / resize / rotate /
  opacity; per-page or whole-document scope.
- **Signatures** — draw or photograph, crop, remove background, reuse from a tray.
- **OCR** — Tesseract, Thai + English, per page.
- **Export** — no-watermark PDF (A4 / Letter / fit, portrait / landscape),
  JPG / PNG; Web Share on mobile, download on desktop.
- **Backup / Restore** — export all data to JSON and restore (merge or replace).
- **PWA** — installable (Add to Home Screen). _No service worker yet, so it still
  needs a network connection to load._

## Libraries

| Library       | How it's loaded              | Used for               |
| ------------- | ---------------------------- | ---------------------- |
| idb           | bundled                      | IndexedDB persistence  |
| jsPDF         | **lazy** chunk               | PDF export             |
| pdfjs-dist    | **lazy** (dynamic import)    | PDF import → images    |
| tesseract.js  | **lazy** (dynamic import)    | OCR (`tha+eng`)        |

> **No OpenCV.** The perspective crop/warp, filters, and document auto-detect are
> all plain JavaScript / canvas ([`src/lib/imaging.js`](./src/lib/imaging.js)).
> The 11 MB OpenCV.js WASM hung on "Loading detector" on real phones, so it was
> removed — the app now loads instantly. Trade-off: no live edge detection while
> aiming; instead you capture, then adjust an auto-seeded (tilt-aware) crop box.

## How it works (quick tour)

- **No router.** `src/App.jsx` holds one `nav` state and switches screens:
  `library → camera → crop → filter → editor`, with `PageDetail` for a single
  page (annotations, OCR, swipe).
- **One store.** `src/store/StoreContext.jsx` holds all state and is the only
  code that writes to IndexedDB (stores: `folders`, `documents`, `signatures`).
  Images are base64 data URLs embedded in the records. Writes catch
  `QuotaExceededError` and surface a "storage full" modal.
- **Pure-JS imaging.** `src/lib/imaging.js` — homography warp (bilinear), filters,
  adjustments, and a self-validating auto-detect cascade (colour flood → Otsu +
  border-class → projection box) that returns real **tilted** quads.
- **Non-destructive.** Each page keeps its original image + crop corners + filter,
  so re-editing re-runs the pipeline instead of degrading the result.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full picture and the
account-migration checklist, or open [`docs/architecture.html`](./docs/architecture.html)
for the diagrams.

## Deploy

Static Vite build served by **Cloudflare Pages** over HTTPS; pushing to `main`
auto-deploys. Full steps (and how to move to a different GitHub / Cloudflare
account) are in [`DEPLOY.md`](./DEPLOY.md).

```bash
git add -A
git commit -m "describe change"
git push          # Cloudflare rebuilds; refresh the phone ~1 min later
```

## Verification

Pure logic (coordinate mapping, auto-detect cascade, filters, export compositing,
tap-to-focus math) is verified by importing the real modules in a browser and
asserting on outputs. Camera-dependent behaviour (live capture, hardware focus)
needs a real device — iOS Safari ignores programmatic focus and autofocuses
continuously, so the focus ring is a visual cue there.
