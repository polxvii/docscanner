// Image processing — pure JavaScript / canvas, no OpenCV.
// Perspective warp, filters, rotate, thumbnails, and a lightweight
// document auto-detect.

import { orderCorners } from './geometry.js';

/** Load a data URL / object URL into an HTMLImageElement. */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

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

// --- Projective transform (4-point homography) --------------------------------

/** Solve an n×n linear system (Gaussian elimination, partial pivot). */
function solve(A, b) {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    const d = A[col][col] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  return b.map((v, i) => v / (A[i][i] || 1e-12));
}

/**
 * Coefficients [a..h] mapping `from` points to `to` points:
 *   X = (a x + b y + c) / (g x + h y + 1)
 *   Y = (d x + e y + f) / (g x + h y + 1)
 */
function projectiveTransform(from, to) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: X, y: Y } = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  return solve(A, b); // [a,b,c,d,e,f,g,h]
}

const MAX_WARP_DIM = 1600;

/**
 * Perspective-warp the image using normalised corners [TL,TR,BR,BL] (0..1).
 * Returns a flattened-document data URL (JPEG). Pure JS inverse mapping with
 * bilinear sampling.
 */
export async function warpPerspective(srcDataUrl, cornersNorm) {
  const img = await loadImage(srcDataUrl);
  const sc = imageToCanvas(img);
  const sw = sc.width;
  const sh = sc.height;
  const src = sc.getContext('2d').getImageData(0, 0, sw, sh).data;

  const px = cornersNorm.map((c) => ({ x: c.x * sw, y: c.y * sh }));
  const [tl, tr, br, bl] = px;

  let outW = Math.max(1, Math.round(Math.max(dist(br, bl), dist(tr, tl))));
  let outH = Math.max(1, Math.round(Math.max(dist(tr, br), dist(tl, bl))));
  const scale = Math.min(1, MAX_WARP_DIM / Math.max(outW, outH));
  outW = Math.max(1, Math.round(outW * scale));
  outH = Math.max(1, Math.round(outH * scale));

  // Transform mapping dest-rect -> source pixels (i.e. the inverse map).
  const dstRect = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];
  const [a, b, c, d, e, f, g, h] = projectiveTransform(dstRect, px);

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d');
  const dstImg = octx.createImageData(outW, outH);
  const dst = dstImg.data;

  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const den = g * u + h * v + 1;
      const sx = (a * u + b * v + c) / den;
      const sy = (d * u + e * v + f) / den;
      const di = (v * outW + u) * 4;

      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) {
        dst[di] = dst[di + 1] = dst[di + 2] = 255;
        dst[di + 3] = 255;
        continue;
      }
      const x0 = sx | 0;
      const y0 = sy | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0;
      const y1 = y0 + 1 < sh ? y0 + 1 : y0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let k = 0; k < 3; k++) {
        const top = src[i00 + k] * (1 - fx) + src[i10 + k] * fx;
        const bot = src[i01 + k] * (1 - fx) + src[i11 + k] * fx;
        dst[di + k] = (top * (1 - fy) + bot * fy) | 0;
      }
      dst[di + 3] = 255;
    }
  }
  octx.putImageData(dstImg, 0, 0);
  return out.toDataURL('image/jpeg', 0.92);
}

// --- Filters ------------------------------------------------------------------

export const FILTERS = [
  { id: 'original', label: 'Original' },
  { id: 'grayscale', label: 'Grayscale' },
  { id: 'bw', label: 'B&W' },
  { id: 'magic', label: 'Magic Color' },
];

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Apply a named filter to an image data URL. Returns a data URL. */
export async function applyFilter(srcDataUrl, filter) {
  if (!filter || filter === 'original') return srcDataUrl;
  const img = await loadImage(srcDataUrl);
  const canvas = imageToCanvas(img);
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  if (filter === 'grayscale') {
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
      d[i] = d[i + 1] = d[i + 2] = l;
    }
  } else if (filter === 'magic') {
    // Contrast + brightness boost for a clean "scanned" look.
    const contrast = 1.3;
    const bright = 8;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = clamp255((d[i] - 128) * contrast + 128 + bright);
      d[i + 1] = clamp255((d[i + 1] - 128) * contrast + 128 + bright);
      d[i + 2] = clamp255((d[i + 2] - 128) * contrast + 128 + bright);
    }
  } else if (filter === 'bw') {
    adaptiveThreshold(d, w, h);
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL(filter === 'bw' ? 'image/png' : 'image/jpeg', 0.92);
}

/**
 * Adaptive mean threshold (integral-image based) — in place on RGBA data.
 * Great for uneven lighting; classic document B&W.
 */
function adaptiveThreshold(d, w, h) {
  const gray = new Float64Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  // Integral image (w+1 × h+1).
  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + rowSum;
    }
  }
  const radius = Math.max(7, Math.round(Math.min(w, h) / 40));
  const C = 8;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * iw + (x1 + 1)] -
        integral[y0 * iw + (x1 + 1)] -
        integral[(y1 + 1) * iw + x0] +
        integral[y0 * iw + x0];
      const mean = sum / count;
      const p = y * w + x;
      const val = gray[p] < mean - C ? 0 : 255;
      const di = p * 4;
      d[di] = d[di + 1] = d[di + 2] = val;
    }
  }
}

// --- Rotate / thumbnail -------------------------------------------------------

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

export function rotateCornersNorm(corners, deg) {
  return corners.map((c) => {
    if (deg === 90) return { x: 1 - c.y, y: c.x };
    if (deg === 180) return { x: 1 - c.x, y: 1 - c.y };
    if (deg === 270) return { x: c.y, y: 1 - c.x };
    return { ...c };
  });
}

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

// --- Lightweight document auto-detect -----------------------------------------

/**
 * Estimate the document rectangle by separating bright "paper" from a darker
 * background (Otsu threshold + row/column projections). Returns normalised
 * ordered corners [TL,TR,BR,BL], or null if nothing plausible is found.
 * Axis-aligned — a good starting box the user fine-tunes.
 */
export async function autoDetectCorners(srcDataUrl) {
  const img = await loadImage(srcDataUrl);
  const W = Math.min(500, img.naturalWidth || 500);
  const H = Math.max(1, Math.round((W * (img.naturalHeight || 1)) / (img.naturalWidth || 1)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.getContext('2d').drawImage(img, 0, 0, W, H);
  const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;

  const gray = new Uint8Array(W * H);
  const hist = new Array(256).fill(0);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
    gray[p] = l;
    hist[l]++;
  }

  // Otsu threshold.
  const total = W * H;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let thresh = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      thresh = t;
    }
  }

  // Column / row bright fractions.
  const colCount = new Int32Array(W);
  const rowCount = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (gray[y * W + x] > thresh) {
        colCount[x]++;
        rowCount[y]++;
      }
    }
  }
  const colThresh = 0.3 * H;
  const rowThresh = 0.3 * W;
  let x0 = -1;
  let x1 = -1;
  for (let x = 0; x < W; x++) if (colCount[x] > colThresh) { if (x0 < 0) x0 = x; x1 = x; }
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) if (rowCount[y] > rowThresh) { if (y0 < 0) y0 = y; y1 = y; }

  if (x0 < 0 || y0 < 0 || x1 - x0 < W * 0.2 || y1 - y0 < H * 0.2) return null;

  const nx0 = x0 / W;
  const nx1 = x1 / W;
  const ny0 = y0 / H;
  const ny1 = y1 / H;
  return orderCorners([
    { x: nx0, y: ny0 },
    { x: nx1, y: ny0 },
    { x: nx1, y: ny1 },
    { x: nx0, y: ny1 },
  ]);
}
