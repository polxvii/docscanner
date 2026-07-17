// Image processing helpers: perspective warp, filters, rotate, thumbnails.
// Every OpenCV Mat is released in a `finally` block.

/** Load a data URL / object URL into an HTMLImageElement. */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/** Draw an image onto a fresh canvas at natural size. */
function imageToCanvas(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Perspective-warp the full-res image using normalised corners
 * [TL,TR,BR,BL] (0..1). Returns a flattened-document data URL (JPEG).
 */
export async function warpPerspective(cv, srcDataUrl, cornersNorm) {
  const img = await loadImage(srcDataUrl);
  const canvas = imageToCanvas(img);
  const W = canvas.width;
  const H = canvas.height;

  // Corner pixels in [TL,TR,BR,BL] order.
  const px = cornersNorm.map((c) => ({ x: c.x * W, y: c.y * H }));
  const [tl, tr, br, bl] = px;

  const outW = Math.max(dist(br, bl), dist(tr, tl));
  const outH = Math.max(dist(tr, br), dist(tl, bl));
  const dw = Math.max(1, Math.round(outW));
  const dh = Math.max(1, Math.round(outH));

  let src, dst, M, srcTri, dstTri;
  try {
    src = cv.imread(canvas);
    dst = new cv.Mat();
    srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
    ]);
    dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, dw, 0, dw, dh, 0, dh,
    ]);
    M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(
      src,
      dst,
      M,
      new cv.Size(dw, dh),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255)
    );
    const out = document.createElement('canvas');
    cv.imshow(out, dst);
    return out.toDataURL('image/jpeg', 0.92);
  } finally {
    src?.delete();
    dst?.delete();
    M?.delete();
    srcTri?.delete();
    dstTri?.delete();
  }
}

export const FILTERS = [
  { id: 'original', label: 'Original' },
  { id: 'grayscale', label: 'Grayscale' },
  { id: 'bw', label: 'B&W' },
  { id: 'magic', label: 'Magic Color' },
];

/** Apply a named filter to an image data URL. Returns a data URL. */
export async function applyFilter(cv, srcDataUrl, filter) {
  if (!filter || filter === 'original') return srcDataUrl;
  const img = await loadImage(srcDataUrl);
  const canvas = imageToCanvas(img);

  let src, dst, gray;
  try {
    src = cv.imread(canvas);
    dst = new cv.Mat();

    if (filter === 'grayscale') {
      gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA);
    } else if (filter === 'bw') {
      gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.adaptiveThreshold(
        gray,
        gray,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        15,
        10
      );
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA);
    } else if (filter === 'magic') {
      // Contrast/brightness boost for a clean "scanned" look.
      src.convertTo(dst, -1, 1.25, 12);
    } else {
      return srcDataUrl;
    }

    const out = document.createElement('canvas');
    cv.imshow(out, dst);
    return out.toDataURL(filter === 'bw' ? 'image/png' : 'image/jpeg', 0.92);
  } finally {
    src?.delete();
    dst?.delete();
    gray?.delete();
  }
}

/** Rotate an image data URL by 90/180/270 degrees. Returns a data URL. */
export async function rotateImage(srcDataUrl, deg) {
  const img = await loadImage(srcDataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const rad = (deg * Math.PI) / 180;
  const swap = deg === 90 || deg === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Rotate normalised corners [TL,TR,BR,BL] to match a 90/270 image rotation,
 * keeping them ordered.
 */
export function rotateCornersNorm(corners, deg) {
  const map = corners.map((c) => {
    if (deg === 90) return { x: 1 - c.y, y: c.x };
    if (deg === 180) return { x: 1 - c.x, y: 1 - c.y };
    if (deg === 270) return { x: c.y, y: 1 - c.x };
    return { ...c };
  });
  return map;
}

/** Downscale to a thumbnail data URL (JPEG). */
export async function makeThumbnail(srcDataUrl, maxDim = 240) {
  const img = await loadImage(srcDataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}
