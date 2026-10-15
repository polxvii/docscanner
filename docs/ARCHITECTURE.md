# DocScanner — Architecture & Handoff Guide

> **Purpose of this document:** a complete, self-contained description of the
> project so it can be picked up by a new owner or moved to a different GitHub /
> Cloudflare account with nothing lost. Pair it with the visual overview in
> [`architecture.html`](./architecture.html) (open it in any browser — it is
> fully offline, no internet needed).
>
> _Last updated: 2026-10-15._

---

## 1. What it is

DocScanner is a **browser-based document scanner** — think CamScanner, but with
**no watermark**, **no accounts**, and **no backend**. Everything runs in the
user's browser; scanned documents live in the browser's own IndexedDB storage.

- **Live URL:** https://docscanner-7lj.pages.dev
- **Repo:** https://github.com/polxvii/docscanner
- **Hosting:** Cloudflare Pages (static hosting, auto-build on `git push`)
- **Stack:** React 18 + Vite 6, 100% client-side. No server, no database, no API
  keys, no secrets in the app itself.

### Core capabilities

| Area | What the user can do |
|------|----------------------|
| **Capture** | Camera scan (tap-to-focus), gallery upload, or import a PDF |
| **Crop** | Drag corner/edge handles, magnifier loupe, rotate, **auto-detect tilted document corners**, pure-JS perspective de-skew |
| **Enhance** | Filters (Grayscale / B&W / Magic Color / Lighten) + intensity, manual adjust (brightness / contrast / white balance / sharpness / clarity), one-tap **✨ Enhance** |
| **Organize** | Folders, multi-page documents, 2-column page grid, drag-reorder, multi-select |
| **Annotate** | Text, signatures, and overlaid images — drag / resize / rotate / opacity, per-page or whole-document scope |
| **Signatures** | Draw or photograph a signature, crop it, remove its background, reuse from a saved tray |
| **OCR** | Extract text per page (Tesseract, Thai + English) |
| **Export** | No-watermark PDF (A4 / Letter / fit, portrait / landscape), JPG, PNG; share sheet on mobile, download on desktop |
| **Data portability** | Backup to a JSON file and restore (merge or replace) |

---

## 2. Technology stack

| Dependency | Version | Loaded | Role |
|-----------|---------|--------|------|
| `react` / `react-dom` | ^18.3 | bundled | UI |
| `vite` + `@vitejs/plugin-react` | ^6.0 / ^4.3 | dev/build | dev server + bundler |
| `idb` | ^8.0 | bundled | thin IndexedDB wrapper |
| `jspdf` | ^2.5 | **lazy** chunk | PDF export |
| `pdfjs-dist` | ^6.2 | **lazy** (dynamic import) | render imported PDF pages → images |
| `tesseract.js` | ^5.1 | **lazy** (dynamic import) | OCR (`tha+eng`) |

**No OpenCV.** It was removed — the 11 MB WASM build hung on "Loading detector"
on real phones. Everything it did (perspective warp, filters, document
auto-detect) is now **plain JavaScript on `<canvas>`** in
[`src/lib/imaging.js`](../src/lib/imaging.js). Trade-off: no live edge detection
while aiming; instead you capture, then adjust an auto-seeded crop box.

### Bundle shape

The main bundle is ~226 KB (≈72 KB gzipped). Heavy libraries are **code-split**
and only downloaded when first used:

- `jspdf` + `html2canvas` → loaded on first PDF export
- `pdfjs-dist` → loaded on first PDF import
- `tesseract.js` → loaded on first OCR run

---

## 3. Repository layout

```
docscanner/
├── index.html                  # app shell: PWA meta, manifest link, inline favicon
├── vite.config.js              # base:'./', LAN host + tunnel hosts allowed
├── wrangler.toml               # Cloudflare Pages: build output = dist/
├── package.json                # deps + scripts (dev / build / preview)
├── .github/workflows/deploy.yml# OPTIONAL CI deploy via Wrangler (needs secrets)
├── public/
│   ├── manifest.webmanifest    # PWA manifest
│   └── icon-192 / 512 / maskable-512.png
├── scanner-app-spec.md         # original product spec (11 phases)
├── README.md                   # quick start + feature status
├── DEPLOY.md                   # deployment + account-change steps
└── docs/                       # ← YOU ARE HERE
    ├── ARCHITECTURE.md         # this file
    └── architecture.html       # offline visual diagrams
└── src/
    ├── main.jsx                # React root; wraps <App/> in <StoreProvider/>
    ├── App.jsx                 # screen state machine + scan-session draft
    ├── App.css / index.css / styles.css
    ├── store/
    │   └── StoreContext.jsx    # global state + IndexedDB CRUD + storage-quota guard
    ├── hooks/
    │   └── usePinchZoom.js     # reusable pinch/zoom/pan (focal-point)
    ├── lib/                    # framework-free logic (unit-testable)
    │   ├── db.js               # IndexedDB open + per-store get/put/delete
    │   ├── id.js               # uid() generator
    │   ├── geometry.js         # pure coordinate math (corners, contentRect)
    │   ├── imaging.js          # warp, filters, adjustments, rotate, auto-detect, thumbs
    │   ├── annotations.js      # applicableAnnotations(doc, page) scope resolver
    │   ├── exporter.js         # PDF/JPG/PNG compose + Web Share (lazy jsPDF)
    │   ├── pdf.js              # pdfToPageImages() via pdfjs-dist
    │   ├── backup.js           # build / export / import full-store JSON backup
    │   ├── signature.js        # signature background removal
    │   └── ocr.js              # Tesseract wrapper
    └── components/
        ├── CameraView.jsx      # live camera, capture, tap-to-focus, upload
        ├── CropScreen.jsx      # crop handles, loupe, rotate, auto-crop, warp
        ├── FilterScreen.jsx    # filters + intensity + adjust panel + Enhance + zoom
        ├── DocumentEditor.jsx  # page grid, reorder, multi-select, add page
        ├── PageDetail.jsx      # single page: zoom/pan, swipe, annotations, OCR
        ├── AnnotationLayer.jsx # renders/drags annotations over a page
        ├── SignatureManager.jsx# draw/upload/crop/bg-removal/save tray
        ├── LibraryScreen.jsx   # folders + document grid + backup menu
        ├── ExportDialog.jsx    # export options modal
        ├── ImportingOverlay.jsx# shared PDF-import progress/error modal
        └── Modal / Spinner / PromptModal.jsx  # small shared UI
```

---

## 4. Screen flow (navigation state machine)

`App.jsx` holds a single `nav` state (`{ name, ... }`) and a transient `draft`
object for an in-progress scan. There is no router; screens are switched by a
`switch (nav.name)`.

```
library ──New scan──▶ camera ──capture──▶ crop ──confirm──▶ filter ──done──▶ editor
   │                    ▲                    │                               │
   │                    └───(gallery/upload)─┘                               │
   │                                                                         │
   ├──Upload image─────────────────────────▶ crop ──▶ filter ──▶ editor      │
   ├──Import PDF──────────────────────────────────────(pages added)─▶ editor │
   └──Open document ─────────────────────────────────────────────────▶ editor ──open page──▶ (PageDetail)
```

- **`library`** — folders + document grid (`LibraryScreen`).
- **`camera`** — `CameraView`; capture produces a full-res JPEG into `draft`.
- **`crop`** — `CropScreen`; de-skews to a flat document on confirm.
- **`filter`** — `FilterScreen`; applies filter + adjustments, commits the page.
- **`editor`** — `DocumentEditor`; the pages of one document. Opening a page
  renders `PageDetail` (annotations, OCR, swipe between pages).

A page edited again (re-edit) re-enters `crop` with the **original** image and
stored corners, so edits are **non-destructive** (original + corners + filter
are always kept on the page).

---

## 5. Imaging engine (`src/lib/imaging.js`)

All pixel work is pure JS on `<canvas>`. Key functions:

- **`warpPerspective(src, cornersNorm)`** — 4-point homography (Gaussian-solved)
  with bilinear inverse sampling → a flat, de-skewed document.
  - Output capped at **2600 px** on the long edge (`MAX_WARP_DIM`) — high enough
    for crisp text (~215 DPI on A4) while bounding memory/CPU.
  - **Fast path:** if the crop quad is the full frame (uncropped upload / "All"),
    it skips the per-pixel warp entirely — returns the source untouched if it is
    within the cap, else one high-quality `drawImage` downscale. Avoids needless
    re-compression.
- **`autoDetectCorners(src)`** — finds the document quadrilateral, **tilt-aware**.
  A self-validating cascade, returning the first plausible result:
  1. **Colour flood** inward from the image border — a smooth backdrop fills,
     the sharp page edge stops it; the largest remaining blob is the page.
     Rejects itself if it leaks into the page.
  2. **Otsu split + border-class** — whichever brightness class dominates the
     image border is the background; the other is the page. Handles both
     dark-on-light and light-on-dark, and can't catastrophically leak.
  3. **Axis-aligned projection box** — last resort.
  A blob's corners are its **diagonal extremes** (min/max of `x±y`), which yields
  a real tilted quad.
- **`applyFilter(src, filter, intensity, preserveAlpha)`** — Grayscale, **B&W**
  (flat-field background division — clean whites under uneven light), **Magic
  Color** (per-channel auto-levels = white balance), **Lighten** (gamma).
  `intensity` blends toward the original. Outputs PNG when alpha must be kept
  (signatures) so transparency isn't lost.
- **`applyAdjustments(src, adj)`** — brightness, contrast, white balance,
  sharpness (unsharp mask), clarity (large-radius local contrast), via an
  integral-image box blur.
- **`rotateImageAny` / `makeThumbnail`** — arbitrary-angle rotate (white
  padding); 240 px thumbnails.

All encodes use a single quality knob `JPEG_Q = 0.95`.

---

## 6. Data model & persistence

### IndexedDB

- **Database:** `docscanner`, version **1**.
- **Object stores** (all `keyPath: 'id'`): `folders`, `documents`, `signatures`.
- Access is wrapped in [`src/lib/db.js`](../src/lib/db.js); global state and all
  writes go through [`src/store/StoreContext.jsx`](../src/store/StoreContext.jsx).

> **Images are stored as base64 data URLs embedded directly in the document
> records.** Simple and self-contained, but space-hungry — hence the storage
> cascade below and the Backup feature.

### Entities

```
Folder     { id, name, createdAt }

Document   { id, folderId|null, name, createdAt, updatedAt,
             thumbnail,                       // small data URL (first page)
             pages:      [ Page ],
             annotations:[ Annotation ] }

Page       { id, originalImage, cropCorners,  // kept for non-destructive re-edit
             filter, processedImage }         // processedImage = what you see

Annotation { id, type:'text'|'signature'|'image',
             x, y, width, height,             // ratios 0..1 of the page image rect
             rotation, opacity,
             scope:'document'|'pages'|'page',
             pageId, pageIds?,                // target(s) depending on scope
             content: { text, color }         //   text
                    | { dataUrl, baseDataUrl, filter } } // signature/image

Signature  { id, name, dataUrl, createdAt }   // reusable, from the saved tray
```

Annotation positions are **ratios of the page's image content rect**, so they
survive different page sizes and map correctly into the exported PDF. Scope
resolution lives in [`src/lib/annotations.js`](../src/lib/annotations.js).

### Storage-quota handling

Every write to IndexedDB is wrapped in `try/catch`. A `QuotaExceededError`
surfaces a global modal — _"Storage is full. Export a backup, then delete some
documents to free space."_ — instead of failing silently.

### Backup / Restore

[`src/lib/backup.js`](../src/lib/backup.js) serializes all three stores to a
single JSON file and restores it (merge or replace). **This is the only way to
move a user's scanned documents between devices or browsers** — the data is not
tied to any account and does not sync.

---

## 7. Export pipeline (`src/lib/exporter.js`)

- Each page is composited onto a canvas: the processed image drawn into its
  content rect, then every applicable annotation drawn at its ratio position
  (with rotation + opacity). Text font size is driven by the annotation's height
  ratio so the editor and the export agree.
- **PDF:** `jsPDF` (lazy-imported). A4 / Letter / fit size, portrait / landscape,
  2× supersample for crisp text, JPEG 0.95. **No watermark.**
- **Images:** per-page or all-pages PNG / JPG.
- **Delivery:** Web Share API with a file (mobile share sheet), falling back to a
  download link (desktop).

---

## 8. PWA status

- **Installable:** `public/manifest.webmanifest` + maskable icons + Apple meta
  tags in `index.html`. "Add to Home Screen" gives an app-like, full-screen
  experience. `theme-color` + `viewport-fit=cover` handle the iOS notch.
- **Not yet offline:** there is **no service worker**, so the app still needs a
  network connection to load its assets. (A service worker that pre-caches the
  build would make it fully offline — a possible future improvement.)

---

## 9. Build & deploy

### Local

```bash
npm install
npm run dev       # dev server, exposed on the LAN for phone testing
npm run build     # production build → dist/
npm run preview   # serve the production build locally
```

> **The camera needs HTTPS or `localhost`.** Over a plain `http://<lan-ip>` URL
> the browser blocks `getUserMedia`. For phone testing use a tunnel (ngrok,
> cloudflared) or the deployed HTTPS URL.

### Production — two possible paths

1. **Cloudflare Pages Git integration (current, recommended).** Cloudflare
   watches the GitHub repo and rebuilds on every push to `main`. Nothing to run;
   `git push` = deploy. Build settings: command `npm run build`, output `dist`,
   `NODE_VERSION=20`.
2. **GitHub Actions + Wrangler (alternative).**
   [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) builds and
   runs `wrangler pages deploy`. It needs two repo **secrets**:
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

> ⚠️ If **both** are active they will each deploy on push (harmless, but
> redundant). Pick one. Today the project uses path #1; the Actions workflow is
> a ready-made alternative if you prefer CI-driven deploys or a different host.

---

## 10. Changing accounts / handoff checklist

Because the app has **no backend and no secrets baked in**, moving it is just
moving the Git repo and re-pointing the host. Nothing in the code needs to
change.

### A. Move the GitHub repo

```bash
# in the project folder, point origin at the new account's empty repo
git remote set-url origin https://github.com/<new-account>/docscanner.git
git push -u origin main
```

(Create the new repo empty — no README/.gitignore — since this repo already has
history. First push on Windows opens a browser login; it caches afterward.)

### B. Re-point the host (Cloudflare Pages, path #1)

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pick the new repo.
2. Build command `npm run build`, output directory `dist`, env `NODE_VERSION=20`.
3. **Save and Deploy.** You get a new `*.pages.dev` URL. Update it in
   `README.md` and in §1 of this doc.

### C. If using GitHub Actions (path #2) instead

In the **new** repo: **Settings → Secrets and variables → Actions** → add
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the new Cloudflare
account. Make sure `--project-name` in `deploy.yml` matches the new Pages
project name.

### D. What does NOT move automatically

- **Users' scanned documents.** They live in each browser's IndexedDB, not in
  any account. To carry data over, use **Backup** (export JSON) on the old
  device/browser and **Restore** on the new one.
- **The `*.pages.dev` subdomain** changes with the new Pages project. Add a
  custom domain in Cloudflare if you want a stable URL.

### E. Nothing else is required

No `.env`, no API keys in the app, no third-party service accounts. The only
account-bound things are: the GitHub repo (code) and the Cloudflare Pages
project (hosting). That's it.

---

## 11. Verification approach

- **Pure logic** (coordinate mapping, auto-detect cascade, filters, export
  compositing, tap-to-focus math) is verified by importing the real modules in a
  browser and asserting on outputs — see the diagrams' "Verification" note and
  the project memory.
- **Camera-dependent flows** (live capture, actual tap-to-focus hardware focus)
  need a **real device** — they cannot be exercised in a headless sandbox. iOS
  Safari in particular ignores programmatic focus constraints (it autofocuses
  continuously), so the focus ring is a visual cue there.
- Every change is built (`npm run build`) and deployed; the live URL is the final
  check on a phone.

---

## 12. Known trade-offs & possible next steps

- **base64 image storage** is simple but heavy. Migrating images to `Blob`s and
  splitting pages into their own IndexedDB store would cut memory a lot — but
  needs a data migration for existing users. Deferred until it actually hurts.
- **No service worker** → not offline. Adding one (e.g. Vite PWA plugin) would
  make the installed app work with no network.
- **No live edge detection** while aiming (deliberate, after dropping OpenCV).
  The post-capture auto-crop now handles tilted documents, which covers most of
  the need.
