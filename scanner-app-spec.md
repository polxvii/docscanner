# Document Scanner Web App — Build Spec

A browser-based document scanner, similar to CamScanner, but with **no watermark** on exports. Runs entirely client-side (no backend, no accounts). Built with **React**.

---

## Goal

Let a user capture or upload a photo of a document, auto-detect and crop it with perspective correction, clean it up with filters, annotate it (text + signature), organize scans into folders, and export clean PDFs with no watermark.

---

## Stack & libraries

- **React** (with a standard build setup — Vite is fine).
- **OpenCV.js** (`https://docs.opencv.org/4.x/opencv.js`) — document edge detection + perspective warp. Loads async; wait for `onRuntimeInitialized` before use. Must call `.delete()` on all `Mat` objects to avoid memory leaks.
- **jsPDF** (`https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`) — PDF export.
- **Tesseract.js** (`https://cdn.jsdelivr.net/npm/tesseract.js@5`) — OCR. Load **Thai + English** language packs (`tha+eng`) — documents are bilingual.
- **idb** (`https://cdn.jsdelivr.net/npm/idb@8`) — IndexedDB wrapper for persistence.
- Signature background removal + all annotation compositing = plain `<canvas>`, no extra library.

> Note: requires **HTTPS or localhost** for camera access. Host on Netlify / Vercel / GitHub Pages.

---

## Screens & flow

```
Library (folders + documents)
   ├─ New scan ──► Live camera ──► Crop & adjust ──► Filter ──► page added to document
   └─ Open document ──► Page viewer ──► edit page / add page / annotate / OCR / export
```

### 1. Library
- **Folders/albums**: documents are organized into folders (e.g. "Work", "Receipts"). Support create / rename / delete folder.
- Within a folder: grid or list of documents showing thumbnail (page 1), name, page count, date.
- Primary action: **New scan**. Also: open, rename, duplicate, delete a document.

### 2. Live camera (manual shutter)
- Live video stream, `facingMode: "environment"`.
- **Real-time document detection**: draw a green quadrilateral overlay tracking the document edges as the camera moves.
  - Detect on a **downscaled** frame (~300px wide), throttled to ~10–15 fps. Never run full-res detection per frame.
  - Pipeline: grayscale → Gaussian blur → Canny → `findContours` → largest 4-corner convex contour with plausible area.
  - **Smooth** corner positions across a few frames (moving average) so the overlay isn't jittery.
  - If no quad found, hide the overlay.
- **Manual shutter** button captures full-res. (No auto-capture in v1.)
- Also allow **upload from gallery** (`<input type="file" accept="image/*">`) as an alternate entry to the same crop screen.

### 3. Crop & adjust
- Show captured/uploaded full-res image with the detected quad as editable handles.
- **4 corner handles** (drag each corner) + **4 edge-midpoint handles** (drag moves the whole side).
- Clamp handles inside image bounds. Positions map correctly between display size and full-res.
- Buttons: **Auto Crop** (re-run detection), **All** (expand to full image / no crop), **Rotate Left**, **Rotate Right**, **Confirm**.
- On confirm: `getPerspectiveTransform` + `warpPerspective` on the **full-res** image → flattened document.

### 4. Filters
- Apply per page: **Original**, **Grayscale**, **B&W / high-contrast** (adaptive threshold), **contrast/brightness boost** ("magic color").
- Preview before applying.

### 5. Page viewer / document editor
- View pages in the document.
- **Reorder pages** (drag) and **delete pages**.
- **Re-edit a page**: re-crop or change filter after the fact — see non-destructive editing below.
- Add more pages (returns to camera/upload).
- Entry points to annotate, OCR, export.

### 6. Annotations (text + signature)
- Add **text boxes** (editable string, font size, color) and **signatures**.
- Each annotation: draggable, resizable, rotatable.
- **Scope toggle per annotation**: "**This page**" (default) or "**All pages**". All-pages annotations render at the same relative position on every page.
- Position/size stored as **ratios (0–1)**, never pixels, so they align across differing page sizes and at export resolution.
- Editing an all-pages annotation updates it everywhere (single shared object). Optional "apply to this page only" to detach a copy.

### 7. Signatures
- Create a signature by uploading/capturing a photo of a signature on paper, OR drawing on a canvas.
- **Background removal**: strip white/light background to transparent.
  - Compute luminance `0.299R + 0.587G + 0.114B`; pixels above a threshold → alpha 0; darker pixels kept. Soft ramp near threshold for clean edges.
  - Expose a **threshold slider** for live tuning (handles shadows / off-white paper / colored ink).
  - Export as **PNG** (preserves transparency).
- **Save signatures for reuse**: store processed transparent PNGs; show a "Saved signatures" tray to pick, place, resize. Support delete.

### 8. OCR
- Run Tesseract with `tha+eng` on a page.
- Show a **progress indicator** (slow on mobile). Make OCR opt-in per page.
- Output extracted text (copyable). Store `ocrText` on the page.
- v1: image-only PDF (no invisible searchable text layer).

### 9. Export
- **PDF** (multi-page, no watermark) via jsPDF — composite each page image + its applicable annotations (document-scoped + that page's own) at ratio positions scaled to page size.
- Also export as **JPG/PNG** (single page or whole document).
- **Page size/orientation**: A4 (default), Letter, or fit-to-image; portrait/landscape.
- **Share vs download**: use Web Share API (`navigator.share`) on mobile with download fallback on desktop.

---

## Data model

```
Folder { id, name, createdAt }

Document {
  id, folderId, name, createdAt, updatedAt,
  thumbnail,                 // small preview of page 1
  pages: [ Page ],
  annotations: [ Annotation ]  // document-level; render filtered by scope
}

Page {
  id,
  originalImage,   // full-res captured/uploaded — kept for non-destructive re-edit
  cropCorners,     // the 4 points used for the warp
  filter,          // which filter is applied
  processedImage,  // warped + filtered result (what's displayed/exported)
  ocrText?         // optional
}

Annotation {
  id, type,              // "signature" | "text"
  content,               // signature PNG dataUrl, OR { text, fontSize, color }
  x, y, width, height,   // ratios 0–1
  rotation,
  scope,                 // "page" | "document"
  pageId                 // set when scope = "page"
}

Signature { id, name, dataUrl, createdAt }   // saved reusable signatures
```

### Persistence
- Use **IndexedDB** (via `idb`) — image data is far too large for localStorage's ~5MB cap.
- Store documents, folders, and saved signatures.
- **Non-destructive editing**: keep each page's `originalImage` plus its crop corners and filter choice, so the user can reopen and re-crop or re-filter without re-scanning.

---

## Empty & error states (write clear in-app messages)
- Camera permission denied → explain how to enable, offer upload instead.
- No document detected in live view → hide overlay; crop screen defaults to full frame for manual adjust.
- OCR found no text → say so plainly.
- Empty library/folder → invite to start a new scan.

---

## Explicitly OUT of scope (v1)
- Multi-device sync, cloud backup, real user accounts (client-side only).
- Auto-capture when steady (manual shutter only).
- Searchable PDF text layer (image-only PDFs).

---

## Key technical cautions
1. **OpenCV performance**: detect on downscaled frames, throttle the loop, warp full-res only once on confirm. Full-res per-frame detection will freeze the phone.
2. **Memory**: `.delete()` every OpenCV `Mat` — leaks crash multi-page sessions fast.
3. **Coordinate mapping**: video resolution ≠ displayed size ≠ downscaled-detection size. Keep scale factors explicit between all three — this is the main source of alignment bugs.
4. **Ratio-based annotations**: never store annotation position/size in absolute pixels.
5. **HTTPS required** for `getUserMedia`.
6. **iOS Safari**: test `getUserMedia` and large-canvas behavior early; it has quirks.
