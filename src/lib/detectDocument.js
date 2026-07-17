// Document edge detection on a *downscaled* frame.
//
// Returns the 4 detected corners as NORMALISED coordinates (0..1 relative to
// the passed canvas), ordered [topLeft, topRight, bottomRight, bottomLeft],
// or `null` if no plausible document quad is found.
//
// CRITICAL: every OpenCV Mat / MatVector allocated here is released in the
// `finally` block. Leaking Mats crashes long multi-page sessions fast.

import { orderCorners } from './geometry.js';

/**
 * @param {object} cv - initialised OpenCV.js module
 * @param {HTMLCanvasElement} canvas - small (~300px wide) frame to analyse
 * @param {{ minAreaRatio?: number }} [opts]
 * @returns {Array<{x:number,y:number}>|null} normalised, ordered corners
 */
export function detectDocument(cv, canvas, opts = {}) {
  const minAreaRatio = opts.minAreaRatio ?? 0.2;
  const W = canvas.width;
  const H = canvas.height;
  if (!W || !H) return null;

  let src, gray, blur, edges, kernel, contours, hierarchy;
  let best = null;

  try {
    src = cv.imread(canvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    blur = new cv.Mat();
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

    edges = new cv.Mat();
    cv.Canny(blur, edges, 50, 150);

    // Dilate to close small gaps in the edge map so contours stay connected.
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.dilate(edges, edges, kernel);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE
    );

    const frameArea = W * H;
    const minArea = frameArea * minAreaRatio;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const area = Math.abs(cv.contourArea(approx));
        if (area > bestArea && area > minArea) {
          bestArea = area;
          if (best) best.delete();
          best = approx.clone();
        }
      }
      approx.delete();
      cnt.delete();
    }

    if (!best) return null;

    const pts = [];
    for (let i = 0; i < 4; i++) {
      pts.push({
        x: best.data32S[i * 2] / W,
        y: best.data32S[i * 2 + 1] / H,
      });
    }
    return orderCorners(pts);
  } finally {
    src?.delete();
    gray?.delete();
    blur?.delete();
    edges?.delete();
    kernel?.delete();
    contours?.delete();
    hierarchy?.delete();
    best?.delete();
  }
}
